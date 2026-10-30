// GET  /api/sync?since=<ms>   changes since the cursor
// POST /api/sync {items: [{key, value, deleted, baseRev}]}
// Every request must come through Cloudflare Access (see server/access.js); data is scoped to that email.
import { requireUser } from "../../server/access.js";
import { ensureSchema, pullChanges, pushChanges, MAX_ITEMS } from "../../server/sync.js";

const noStore = { "Cache-Control": "no-store" };

async function withUser(context, handler) {
  if (!context.env.DB) return Response.json({ error: "no_database", message: "尚未綁定 D1（變數名稱 DB）。" }, { status: 503, headers: noStore });
  const auth = await requireUser(context.request, context.env);
  if (auth.error) return auth.error;
  await ensureSchema(context.env.DB);
  return handler(auth.email);
}

export const onRequestGet = (context) => withUser(context, async (user) => {
  const since = new URL(context.request.url).searchParams.get("since");
  return Response.json({ user, ...(await pullChanges(context.env.DB, user, since)) }, { headers: noStore });
});

export const onRequestPost = (context) => withUser(context, async (user) => {
  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return Response.json({ error: "bad_json" }, { status: 400, headers: noStore });
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length > MAX_ITEMS) return Response.json({ error: "too_many_items" }, { status: 413, headers: noStore });
  return Response.json({ user, ...(await pushChanges(context.env.DB, user, items)) }, { headers: noStore });
});
