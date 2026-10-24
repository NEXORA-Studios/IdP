import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters");
  return argon2.hash(password, { type: argon2.argon2id });
}
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export function randomToken(bytes = 32): string { return randomBytes(bytes).toString("base64url"); }
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function constantTimeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
