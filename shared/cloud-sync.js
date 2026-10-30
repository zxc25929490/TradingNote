// Cloud sync between devices (Cloudflare Pages + D1, see functions/api/sync.js).
// Loaded early in <head> of every system, before any app script touches localStorage:
// - every write to an app key (the same prefixes the full backup covers) is marked dirty and pushed;
// - changes from other devices are pulled on open, on return to the tab and every minute;
// - a write based on an old version comes back as a conflict and is merged (record lists by id) and retried.
// Served without the API (the local python server, file://) it switches itself off and the app stays local.
(function initCloudSync(root) {
  const PREFIXES = ["tradingnote.", "trading-research.", "trs."];
  // Display preferences stay per device.
  const LOCAL_ONLY = new Set(["tradingnote.theme", "tradingnote.sidebar", "tradingnote.effects", "tradingnote.breakpointCompare", "tradingnote.lastBackupAt"]);
  const STATE_KEY = "tnsync.state";

  const isSyncable = (key) => typeof key === "string" && PREFIXES.some((prefix) => key.startsWith(prefix)) && !LOCAL_ONLY.has(key);

  const parse = (text) => {
    if (text == null) return undefined;
    try { return JSON.parse(text); } catch (_) { return undefined; }
  };
  const recordId = (item) => (item && typeof item === "object" ? item.localId ?? item.id ?? item.baseKey ?? null : null);
  const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

  // Merge two versions of the same key after both sides changed it.
  // - lists of records (trades, breakpoints, backtests) -> union by id, our side wins on the same id;
  // - lists of plain values (deleted-trade keys) -> union;
  // - plain objects (annotations by trade) -> shallow merge, our side wins per field;
  // - anything else -> `preferLocal` decides (false on a device's first sync, so the cloud copy stays).
  function mergeValues(localText, remoteText, { preferLocal = true } = {}) {
    if (remoteText == null) return localText;
    if (localText == null) return remoteText;
    const local = parse(localText);
    const remote = parse(remoteText);
    if (Array.isArray(local) && Array.isArray(remote)) {
      const allRecords = [...local, ...remote].every((item) => recordId(item) != null);
      if (allRecords) {
        const merged = new Map(remote.map((item) => [String(recordId(item)), item]));
        for (const item of local) merged.set(String(recordId(item)), item);
        return JSON.stringify([...merged.values()]);
      }
      if ([...local, ...remote].every((item) => item === null || typeof item !== "object")) {
        return JSON.stringify([...new Set([...remote, ...local])]);
      }
    }
    if (isPlainObject(local) && isPlainObject(remote)) return JSON.stringify({ ...remote, ...local });
    return preferLocal ? localText : remoteText;
  }

  const api = { isSyncable, mergeValues, PREFIXES, LOCAL_ONLY };
  root.TradingNoteCloudSync = api;

  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  if (!/^https?:$/.test(location.protocol)) return;

  const storage = window.localStorage;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const write = (key, value) => (value == null ? rawRemove.call(storage, key) : rawSet.call(storage, key, value));

  function loadState() {
    try {
      const state = JSON.parse(storage.getItem(STATE_KEY) || "null");
      if (state && typeof state === "object") return { cursor: 0, revs: {}, dirty: {}, ...state };
    } catch (_) { /* fall through */ }
    return { cursor: 0, revs: {}, dirty: {}, initialized: false };
  }
  let state = loadState();
  const saveState = () => { try { rawSet.call(storage, STATE_KEY, JSON.stringify(state)); } catch (_) { /* full */ } };

  let enabled = true;
  let pushTimer = null;
  let busy = false;
  let pendingReload = false;
  const status = { text: "連線中…", tone: "muted" };

  // A device that has never synced uploads everything it already has; first-sync conflicts merge
  // record lists and otherwise keep the cloud copy.
  if (!state.initialized) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (isSyncable(key)) state.dirty[key] = true;
    }
    state.firstSync = true;
    saveState();
  }

  Storage.prototype.setItem = function setItem(key, value) {
    rawSet.call(this, key, value);
    if (this === storage && enabled && isSyncable(key)) markDirty(key);
  };
  Storage.prototype.removeItem = function removeItem(key) {
    rawRemove.call(this, key);
    if (this === storage && enabled && isSyncable(key)) markDirty(key);
  };

  // Several system tabs share the same bookkeeping, so always start from what is stored.
  function markDirty(key) {
    state = loadState();
    state.dirty[key] = true;
    saveState();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, 1000);
    setStatus("尚未同步的變更…", "muted");
  }

  async function request(method, body, since) {
    const url = method === "GET" ? `/api/sync?since=${encodeURIComponent(since || 0)}` : "/api/sync";
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual", // an expired Access session answers with a redirect to the login page
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404 || response.status === 405) { disable(); return null; }
    if (response.status === 503) { setStatus("雲端同步尚未設定", "warn"); return null; }
    if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) { setStatus("請重新登入後再同步", "warn"); return null; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("Content-Type") || "";
    if (!type.includes("application/json")) { disable(); return null; }
    return response.json();
  }

  function disable() {
    enabled = false;
    setStatus("", "hidden");
  }

  async function pull() {
    const data = await request("GET", null, state.cursor);
    if (!data) return false;
    let applied = 0;
    for (const item of data.items || []) {
      if (!isSyncable(item.key) || (state.revs[item.key] || 0) >= item.rev) continue;
      if (state.dirty[item.key]) continue; // our pending write will meet this version as a conflict and merge
      write(item.key, item.deleted ? null : item.value);
      state.revs[item.key] = item.rev;
      applied += 1;
    }
    state.cursor = data.cursor || state.cursor;
    saveState();
    return applied;
  }

  async function push() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const keys = Object.keys(state.dirty).filter(isSyncable).slice(0, 200);
      if (!keys.length) return { rejected: [] };
      const sent = new Map(keys.map((key) => [key, storage.getItem(key)]));
      const data = await request("POST", {
        items: keys.map((key) => ({ key, value: sent.get(key), deleted: sent.get(key) == null, baseRev: state.revs[key] || 0 })),
      });
      if (!data) return null;
      for (const { key, rev } of data.accepted || []) {
        state.revs[key] = rev;
        if (storage.getItem(key) === sent.get(key)) delete state.dirty[key];
      }
      for (const conflict of data.conflicts || []) {
        const merged = mergeValues(storage.getItem(conflict.key), conflict.deleted ? null : conflict.value, { preferLocal: !state.firstSync });
        write(conflict.key, merged);
        state.revs[conflict.key] = conflict.rev;
        if (merged === (conflict.deleted ? null : conflict.value)) delete state.dirty[conflict.key];
        pendingReload = true;
      }
      for (const { key } of data.rejected || []) delete state.dirty[key];
      saveState();
      if (data.rejected?.length) return { rejected: data.rejected };
      if (!(data.conflicts || []).length && Object.keys(state.dirty).length === 0) return { rejected: [] };
    }
    return { rejected: [] };
  }

  async function sync({ initial = false } = {}) {
    if (!enabled || busy) return;
    busy = true;
    clearTimeout(pushTimer);
    state = loadState();
    try {
      const applied = await pull();
      if (applied === false) return;
      const pushed = await push();
      if (pushed === null || !enabled) return;
      state.initialized = true;
      state.firstSync = false;
      saveState();
      if (applied || pendingReload) {
        if (initial && !recentlyReloaded()) {
          markReloaded();
          location.reload();
          return;
        }
        showReloadPrompt();
      }
      const time = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
      if (pushed.rejected.length) setStatus(`${pushed.rejected.length} 項太大無法同步（含圖片？）`, "warn");
      else setStatus(`已同步 · ${time}`, "ok");
    } catch (_) {
      setStatus(navigator.onLine === false ? "離線中，連線後會自動同步" : "同步失敗，稍後重試", "warn");
    } finally {
      busy = false;
      if (Object.keys(state.dirty).length && enabled) pushTimer = setTimeout(sync, 15000);
    }
  }

  function recentlyReloaded() {
    try { return Date.now() - Number(sessionStorage.getItem("tnsync.reloadedAt") || 0) < 15000; } catch (_) { return true; }
  }
  function markReloaded() {
    try { sessionStorage.setItem("tnsync.reloadedAt", String(Date.now())); } catch (_) { /* ignore */ }
  }

  // ---- Status line in the sidebar footer (shared/sidebar.js builds the footer) ----
  let statusEl = null;
  function setStatus(text, tone) {
    status.text = text;
    status.tone = tone;
    if (!statusEl) return;
    statusEl.hidden = tone === "hidden";
    statusEl.dataset.tone = tone;
    statusEl.querySelector(".nav-label").textContent = text;
  }
  function showReloadPrompt() {
    if (!statusEl || statusEl.querySelector("button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "有新資料 · 重新載入";
    button.addEventListener("click", () => location.reload());
    statusEl.appendChild(button);
  }
  function mountStatus() {
    const footer = document.querySelector(".sidebar-footer");
    if (!footer || statusEl) return;
    statusEl = document.createElement("div");
    statusEl.className = "sync-status";
    statusEl.innerHTML = `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z"/></svg></span><span class="nav-label"></span>`;
    footer.prepend(statusEl);
    setStatus(status.text, status.tone);
  }

  document.addEventListener("DOMContentLoaded", mountStatus);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); else if (Object.keys(state.dirty).length) sync(); });
  window.addEventListener("online", () => sync());
  setInterval(() => { if (document.visibilityState === "visible") sync(); }, 60000);
  sync({ initial: true });

  Object.assign(api, { sync, state: () => state });
})(typeof window !== "undefined" ? window : globalThis);
