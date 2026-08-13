/** Constant-time string comparison to avoid timing-based key disclosure. */
function safeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Validates `Authorization: Bearer <key>` against the expected key.
 * Returns false for missing/malformed headers, so callers always get 401.
 */
export function authenticate(request: Request, expectedKey: string): boolean {
  if (!expectedKey) {
    return false;
  }
  const header = request.headers.get("Authorization");
  if (!header) {
    return false;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return false;
  }
  return safeEqual(match[1], expectedKey);
}
