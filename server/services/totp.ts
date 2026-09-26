import crypto from "crypto";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generates a random RFC 3548 Base32 secret for TOTP.
 */
export function generateBase32Secret(length = 20): string {
  const randomBytes = crypto.randomBytes(length);
  let secret = "";
  for (let i = 0; i < randomBytes.length; i++) {
    secret += BASE32_CHARS[randomBytes[i] % 32];
  }
  return secret;
}

/**
 * Decodes a Base32 string to Buffer.
 */
export function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates 6-digit TOTP token using HMAC-SHA1 according to RFC 6238.
 */
export function generateTotp(secret: string, timeStep = 30, windowDrift = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const time = Math.floor(epoch / timeStep) + windowDrift;
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(time));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", key).update(timeBuf).digest();

  const offset = hmac[hmac.length - 1] & 0xf;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (codeInt % 1000000).toString().padStart(6, "0");
  return otp;
}

/**
 * Verifies a 6-digit token against a Base32 secret with +/- 1 window tolerance.
 */
export function verifyTotp(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  const cleanedToken = token.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanedToken)) return false;

  for (const drift of [0, -1, 1]) {
    if (generateTotp(secret, 30, drift) === cleanedToken) {
      return true;
    }
  }
  return false;
}

/**
 * Generates human-readable, one-time backup recovery codes.
 */
export function generateRecoveryCodes(count = 6): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    codes.push(`AUR-${p1}-${p2}`);
  }
  return codes;
}

/**
 * Constructs a standard otpauth URI.
 */
export function generateOtpauthUrl(email: string, secret: string, issuer = "Aurevyxon"): string {
  const cleanEmail = encodeURIComponent(email.trim() || "user");
  const cleanIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}
