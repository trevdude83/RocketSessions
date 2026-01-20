import crypto from "crypto";

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function hashString(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

