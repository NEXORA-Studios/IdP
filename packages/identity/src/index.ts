export type UserStatus = "pending_verification" | "active" | "suspended" | "disabled" | "deleted";
export interface User { id: string; status: UserStatus; displayName: string | null; }
export function normalizeEmail(email: string): string {
  const normalized = email.trim().normalize("NFC").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) throw new Error("Invalid email address");
  return normalized;
}
export function canAuthenticate(user: Pick<User, "status">): boolean { return user.status === "active"; }
export function canVerifyEmail(user: Pick<User, "status">): boolean { return user.status === "pending_verification"; }
export interface IdentityRepository {
  findByEmail(email: string): Promise<User | null>;
  createUser(input: { email: string; passwordHash: string; displayName?: string }): Promise<User>;
  setStatus(userId: string, status: UserStatus): Promise<void>;
  createSession(input: { userId: string; expiresAt: Date; authTime: Date }): Promise<{ id: string }>;
  revokeSessions(userId: string, exceptSessionId?: string): Promise<void>;
}
export class IdentityService {
  constructor(private readonly repository: IdentityRepository) {}
  async register(input: { email: string; passwordHash: string; displayName?: string }) {
    return this.repository.createUser({ ...input, email: normalizeEmail(input.email) });
  }
  async authenticate(email: string): Promise<User | null> {
    const user = await this.repository.findByEmail(normalizeEmail(email));
    return user && canAuthenticate(user) ? user : null;
  }
  async revokeOtherSessions(userId: string, currentSessionId: string) { return this.repository.revokeSessions(userId, currentSessionId); }
}
