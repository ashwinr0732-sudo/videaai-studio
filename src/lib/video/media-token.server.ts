/**
 * Short-lived signed tokens for `<video>` / download links.
 *
 * A media element cannot send an Authorization header, so instead of trusting a
 * user id in the query string we mint an HMAC token bound to (jobId, userId)
 * with an expiry. Only server code holds the signing key.
 */

const TTL_SECONDS = 60 * 60; // 1 hour

function signingKey() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_DB_URL"];
  if (!key) throw new Error("Media signing key is not configured.");
  return key;
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createMediaToken(jobId: string, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${jobId}.${userId}.${exp}`;
  return `${exp}.${userId}.${await hmac(payload)}`;
}

/** Returns the verified owner id, or null when the token is invalid/expired. */
export async function verifyMediaToken(jobId: string, token: string | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expRaw, userId, sig] = parts as [string, string, string];
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmac(`${jobId}.${userId}.${exp}`);
  return timingSafeEqual(expected, sig) ? userId : null;
}
