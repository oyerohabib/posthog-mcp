/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function keyFromEnv(raw?: string): Buffer {
  const src = raw ?? process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (!src) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required");
  }
  // Accept 64-char hex or raw 32-byte utf8 / base64
  if (/^[0-9a-fA-F]{64}$/.test(src)) {
    return Buffer.from(src, "hex");
  }
  const b64 = Buffer.from(src, "base64");
  if (b64.length === 32) return b64;
  const utf = Buffer.from(src, "utf8");
  if (utf.length === 32) return utf;
  throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (hex/base64/utf8)");
}

export function encryptSecret(
  plaintext: string,
  keyMaterial?: string,
): Buffer {
  const key = keyFromEnv(keyMaterial);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptSecret(
  blob: Buffer,
  keyMaterial?: string,
): string {
  const key = keyFromEnv(keyMaterial);
  if (blob.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid ciphertext");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Generate a random 32-byte key as hex (for docs / setup). */
export function generateEncryptionKeyHex(): string {
  return randomBytes(32).toString("hex");
}
