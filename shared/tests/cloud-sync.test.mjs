import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { verifyAccessJwt, requireUser } from "../../server/access.js";
import { ensureSchema, pullChanges, pushChanges, resetSchemaCache } from "../../server/sync.js";
import { onRequestGet, onRequestPost } from "../../functions/api/sync.js";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const clientSource = read("shared/cloud-sync.js");

// ---- D1 stand-in backed by real SQLite, so the SQL itself is exercised ----
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => statement(sql), batch: async (list) => Promise.all(list.map((item) => item.run())) };
}

// ---- Client merge rules ----
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(clientSource, sandbox);
const { mergeValues, isSyncable } = sandbox.TradingNoteCloudSync;
const json = (text) => JSON.parse(text);

assert.equal(isSyncable("tradingnote.localTrades"), true);
assert.equal(isSyncable("trs.trades"), true);
assert.equal(isSyncable("tradingnote.theme"), false, "theme stays per device");
assert.equal(isSyncable("tnsync.state"), false);
assert.equal(isSyncable("other.key"), false);

// Record lists merge by id; our side wins on the same id.
assert.deepEqual(json(mergeValues(
  JSON.stringify([{ localId: "a", r: 2 }, { localId: "c", r: 3 }]),
  JSON.stringify([{ localId: "a", r: 1 }, { localId: "b", r: -1 }]),
)).map((t) => `${t.localId}${t.r}`).sort(), ["a2", "b-1", "c3"]);
// Plain lists (deleted-trade keys) union; objects (annotations) merge per field.
assert.deepEqual(json(mergeValues('["x","y"]', '["y","z"]')).sort(), ["x", "y", "z"]);
assert.deepEqual(json(mergeValues('{"t1":{"grade":"A"}}', '{"t1":{"grade":"C"},"t2":{"grade":"B"}}')), { t1: { grade: "A" }, t2: { grade: "B" } });
// Single values: ours wins normally, the cloud wins on a device's first sync.
assert.equal(mergeValues("mine", "theirs"), "mine");
assert.equal(mergeValues("mine", "theirs", { preferLocal: false }), "theirs");
assert.equal(mergeValues(null, "theirs"), "theirs");

// ---- Server: versions and conflicts ----
resetSchemaCache();
const d1 = fakeD1();
await ensureSchema(d1);
let result = await pushChanges(d1, "me@x.com", [{ key: "tradingnote.localTrades", value: "[1]", baseRev: 0 }], 1000);
assert.deepEqual(result.accepted, [{ key: "tradingnote.localTrades", rev: 1 }]);
result = await pushChanges(d1, "me@x.com", [{ key: "tradingnote.localTrades", value: "[2]", baseRev: 0 }], 2000);
assert.equal(result.conflicts.length, 1, "a write based on an old version is refused");
assert.deepEqual({ ...result.conflicts[0] }, { key: "tradingnote.localTrades", value: "[1]", deleted: false, rev: 1 });
result = await pushChanges(d1, "me@x.com", [{ key: "tradingnote.localTrades", value: "[1,2]", baseRev: 1 }], 3000);
assert.equal(result.accepted[0].rev, 2);
result = await pushChanges(d1, "me@x.com", [{ key: "evil.key", value: "x" }, { key: "tradingnote.big", value: "x".repeat(2_000_000) }]);
assert.deepEqual(result.rejected.map((item) => item.reason), ["invalid_key", "too_large"]);
// Users never see each other's rows.
assert.equal((await pullChanges(d1, "other@x.com", 0)).items.length, 0);
const pulled = await pullChanges(d1, "me@x.com", 2500, 10_000);
assert.deepEqual(pulled.items.map((item) => `${item.key}@${item.rev}`), ["tradingnote.localTrades@2"]);
assert.equal(pulled.cursor, 5000, "cursor overlaps by 5 s");
// Deletion is a versioned write too.
result = await pushChanges(d1, "me@x.com", [{ key: "tradingnote.localTrades", value: null, deleted: true, baseRev: 2 }], 4000);
assert.equal(result.accepted[0].rev, 3);
assert.equal((await pullChanges(d1, "me@x.com", 3500)).items[0].deleted, true);

// ---- Cloudflare Access JWT ----
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" };
const certs = async () => new Response(JSON.stringify({ keys: [jwk] }));
const b64url = (data) => Buffer.from(data).toString("base64url");
async function token(claims, kid = "k1") {
  const head = b64url(JSON.stringify({ alg: "RS256", kid }));
  const body = b64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}
const team = "team.cloudflareaccess.com";
const good = { aud: ["AUD1"], iss: `https://${team}`, email: "Me@X.com", exp: Date.now() / 1000 + 600 };
const verify = (jwt) => verifyAccessJwt(jwt, { teamDomain: team, audience: "AUD1", fetcher: certs });
assert.equal(await verify(await token(good)), "me@x.com");
assert.equal(await verify(await token({ ...good, aud: ["OTHER"] })), null, "wrong application");
assert.equal(await verify(await token({ ...good, exp: Date.now() / 1000 - 5 })), null, "expired");
assert.equal(await verify(await token({ ...good, iss: "https://evil.example" })), null, "wrong issuer");
assert.equal(await verify(await token(good, "unknown")), null, "unknown signing key");
const forged = (await token(good)).split(".");
forged[1] = b64url(JSON.stringify({ ...good, email: "attacker@x.com" }));
assert.equal(await verify(forged.join(".")), null, "tampered payload");
assert.equal(await verify("not-a-jwt"), null);

// Without Access configured, the API refuses instead of serving data.
const noConfig = await requireUser(new Request("https://notes.pages.dev/api/sync"), {});
assert.equal(noConfig.error.status, 503);
const noToken = await requireUser(new Request("https://notes.pages.dev/api/sync"), { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "AUD1" }, { fetcher: certs });
assert.equal(noToken.error.status, 401);
// DEV_USER only works on localhost.
assert.equal((await requireUser(new Request("https://notes.pages.dev/api/sync"), { DEV_USER: "dev" })).error.status, 503);

// ---- End to end: two devices running the real client against the real handler ----
resetSchemaCache();
const shared = { DB: fakeD1(), DEV_USER: "me@x.com" };
async function serverFetch(url, init = {}) {
  const request = new Request(new URL(url, "http://localhost"), init);
  const context = { request, env: shared };
  return init.method === "POST" ? onRequestPost(context) : onRequestGet(context);
}
function device(initial = {}) {
  class FakeStorage {
    constructor() { this.data = new Map(); }
    get length() { return this.data.size; }
    key(index) { return [...this.data.keys()][index] ?? null; }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
  }
  const localStorage = new FakeStorage();
  for (const [key, value] of Object.entries(initial)) localStorage.data.set(key, value);
  const env = {
    console, Storage: FakeStorage, localStorage, sessionStorage: new FakeStorage(),
    location: { protocol: "http:", reloads: 0, reload() { this.reloads += 1; } },
    document: { visibilityState: "visible", addEventListener() {}, querySelector: () => null },
    navigator: { onLine: true },
    fetch: serverFetch, Response, Request, URL, JSON, Date, Map, Set, Number, String, Object, Array, Promise,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
  };
  env.window = env;
  env.globalThis = env;
  env.addEventListener = () => {};
  vm.createContext(env);
  vm.runInContext(clientSource, env);
  return env;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

// The computer has trades before sync exists; its first sync uploads them.
const computer = device({ "tradingnote.localTrades": JSON.stringify([{ localId: "c1", r: 1 }]), "tradingnote.theme": "light" });
await settle();
await computer.TradingNoteCloudSync.sync();
// The phone opens the site for the first time and receives them (reloading once to show them).
const phone = device();
await settle();
assert.deepEqual(JSON.parse(phone.localStorage.getItem("tradingnote.localTrades")), [{ localId: "c1", r: 1 }]);
assert.equal(phone.localStorage.getItem("tradingnote.theme"), null, "theme is not synced");
assert.equal(phone.location.reloads, 1);

// Both record a trade before syncing: the conflict merges, nothing is lost.
phone.localStorage.setItem("tradingnote.localTrades", JSON.stringify([{ localId: "c1", r: 1 }, { localId: "p1", r: -1 }]));
computer.localStorage.setItem("tradingnote.localTrades", JSON.stringify([{ localId: "c1", r: 1 }, { localId: "c2", r: 2 }]));
await phone.TradingNoteCloudSync.sync();
await computer.TradingNoteCloudSync.sync();
await phone.TradingNoteCloudSync.sync();
const ids = (env) => JSON.parse(env.localStorage.getItem("tradingnote.localTrades")).map((t) => t.localId).sort();
assert.deepEqual(ids(computer), ["c1", "c2", "p1"]);
assert.deepEqual(ids(phone), ["c1", "c2", "p1"]);

// A deletion on one device reaches the other.
computer.localStorage.removeItem("tradingnote.accountRules");
computer.localStorage.setItem("tradingnote.accountRules", '{"initialBalance":100000}');
await computer.TradingNoteCloudSync.sync();
await phone.TradingNoteCloudSync.sync();
assert.equal(phone.localStorage.getItem("tradingnote.accountRules"), '{"initialBalance":100000}');
computer.localStorage.removeItem("tradingnote.accountRules");
await computer.TradingNoteCloudSync.sync();
await phone.TradingNoteCloudSync.sync();
assert.equal(phone.localStorage.getItem("tradingnote.accountRules"), null);

// Wiring: every system loads the client before its app scripts; the build has a root page.
for (const system of ["live-system", "research-system", "review-system", "analysis-system"]) {
  const html = read(`${system}/index.html`);
  const syncAt = html.indexOf("../shared/cloud-sync.js");
  assert.ok(syncAt > 0 && syncAt < html.indexOf("</head>"), `${system} loads cloud-sync in <head>`);
}
assert.match(read("scripts/build-pages.mjs"), /url=live-system\/index\.html/);

console.log("Cloud sync tests passed");
