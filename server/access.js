// Cloudflare Access: verifies the signed JWT that Access adds to every request it lets through
// (header Cf-Access-Jwt-Assertion) and returns the signed-in email. Checking the signature here means
// the API stays closed even if a request somehow bypasses Access (a preview URL, a misconfigured rule).
//
// Required environment variables (Pages → Settings → Variables):
//   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag of the Access application
// Local development only: DEV_USER (e.g. in .dev.vars) skips the check for localhost requests.

const certCache = new Map();

const b64urlToBytes = (text) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};
const decodeJson = (part) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));

async function signingKeys(teamDomain, fetcher) {
  const cached = certCache.get(teamDomain);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`certs ${response.status}`);
  const { keys = [] } = await response.json();
  certCache.set(teamDomain, { keys, expires: Date.now() + 10 * 60 * 1000 });
  return keys;
}

export async function verifyAccessJwt(token, { teamDomain, audience, fetcher = fetch, now = Date.now() }) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch (_) {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const jwk = (await signingKeys(teamDomain, fetcher)).find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) return null;
  if (payload.iss !== `https://${teamDomain}`) return null;
  const seconds = now / 1000;
  if (typeof payload.exp !== "number" || payload.exp < seconds) return null;
  if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return null;
  return typeof payload.email === "string" && payload.email ? payload.email.toLowerCase() : null;
}

// Resolves the user for a request, or returns a Response explaining why not.
export async function requireUser(request, env, { fetcher = fetch } = {}) {
  const host = new URL(request.url).hostname;
  if (env.DEV_USER && (host === "localhost" || host === "127.0.0.1")) return { email: String(env.DEV_USER) };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { error: Response.json({ error: "not_configured", message: "Cloudflare Access 尚未設定（ACCESS_TEAM_DOMAIN / ACCESS_AUD）。" }, { status: 503 }) };
  }
  const email = await verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    fetcher,
  }).catch(() => null);
  if (!email) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { email };
}
