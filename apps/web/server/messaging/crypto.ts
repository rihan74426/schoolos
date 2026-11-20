import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url). The institution id is bound as
// additional authenticated data, so a ciphertext copied to another school fails to decrypt.
// Buffers are wrapped as Uint8Array to satisfy newer @types/node signatures.
const u8 = (buf: Buffer) => new Uint8Array(buf);

function masterKey() {
  const raw = process.env.MESSAGING_ENCRYPTION_KEY;
  if (!raw) throw new Error("MESSAGING_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MESSAGING_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return u8(key);
}

export function encryptSecret(plain: string, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), u8(iv));
  cipher.setAAD(u8(Buffer.from(aad)));
  const data = Buffer.concat([u8(cipher.update(plain, "utf8")), u8(cipher.final())]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(token: string, aad: string) {
  const [version, iv, tag, data] = token.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported credential format");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), u8(Buffer.from(iv, "base64url")));
  decipher.setAAD(u8(Buffer.from(aad)));
  decipher.setAuthTag(u8(Buffer.from(tag, "base64url")));
  const plain = Buffer.concat([u8(decipher.update(u8(Buffer.from(data, "base64url")))), u8(decipher.final())]);
  return plain.toString("utf8");
}
