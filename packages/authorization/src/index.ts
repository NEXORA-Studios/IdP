export const STANDARD_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
export type StandardScope = (typeof STANDARD_SCOPES)[number];
export function parseScopes(scope: string): string[] {
  const values = [...new Set(scope.trim().split(/\s+/).filter(Boolean))];
  if (values.length === 0) throw new Error("scope is required");
  return values;
}
export function validateScopes(requested: string[], allowed: readonly string[]): void {
  const permitted = new Set(allowed);
  const invalid = requested.filter((scope) => !permitted.has(scope));
  if (invalid.length) throw new Error(`Invalid scope: ${invalid.join(", ")}`);
  if (requested.includes("offline_access") && !requested.includes("openid")) throw new Error("offline_access requires openid");
}
export function validateRedirectUri(uri: string, registered: readonly string[]): boolean { return registered.includes(uri); }
export interface AuthorizationDecision { userId: string; clientId: string; scopes: string[]; grantedAt: Date; }
export interface AuthorizationRepository { save(decision: AuthorizationDecision): Promise<void>; revoke(userId: string, clientId: string): Promise<void>; active(userId: string, clientId: string): Promise<AuthorizationDecision | null>; }
export class AuthorizationService {
  constructor(private readonly repository: AuthorizationRepository) {}
  async grant(input: Omit<AuthorizationDecision, "grantedAt">) { const decision = { ...input, grantedAt: new Date() }; await this.repository.save(decision); return decision; }
  revoke(userId: string, clientId: string) { return this.repository.revoke(userId, clientId); }
}
