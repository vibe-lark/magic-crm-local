import crypto from "node:crypto";

export function id(prefix: string, bytes = 18): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function base64urlSha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}
