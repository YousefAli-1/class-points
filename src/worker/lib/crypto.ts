// WebCrypto only: the Workers runtime has no native Node crypto here.

const PBKDF2_ITERATIONS = 100_000; // the Workers maximum
const SALT_BYTES = 16;
const HASH_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

async function pbkdf2(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/** PBKDF2-SHA256 with a random 16-byte salt, stored as `pbkdf2$100000$<salt b64>$<hash b64>`. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** True when `secret` matches a `hashSecret` result. A malformed `stored` value never matches. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const [, iter, saltB64, hashB64] = parts;
  const iterations = Number(iter);
  // The runtime refuses more than PBKDF2_ITERATIONS, so such a value can't be one of ours.
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  let salt: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(saltB64);
  } catch {
    return false;
  }
  const actual = toBase64(await pbkdf2(secret, salt, iterations));
  return safeEqual(actual, hashB64);
}

/** 32 random bytes, base64url without padding. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in time that depends only on the lengths, never on where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const length = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
