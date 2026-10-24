import Provider from "oidc-provider";

export interface OidcAccount { accountId: string; claims(): Promise<Record<string, unknown>>; }
export interface OidcAdapter { new (name: string): object; }
export interface OidcOptions { issuer: string; adapter?: OidcAdapter; findAccount: (ctx: unknown, id: string) => Promise<OidcAccount | undefined>; }

export function createOidcProvider(options: OidcOptions): Provider {
  const provider = new Provider(options.issuer, {
    adapter: options.adapter,
    claims: { address: ["address"], email: ["email", "email_verified"], profile: ["name"] },
    features: {
      devInteractions: { enabled: false },
      claimsParameter: { enabled: false },
      revocation: { enabled: true },
      introspection: { enabled: true },
      rpInitiatedLogout: { enabled: true },
      resourceIndicators: { enabled: true, ack: "https://datatracker.ietf.org/doc/html/rfc8707" },
    },
    findAccount: options.findAccount,
    conformIdTokenClaims: false,
    ttl: { AccessToken: 600, AuthorizationCode: 60, IdToken: 600, RefreshToken: 30 * 24 * 60 * 60 },
    cookies: { keys: ["development-only-replace-this-key"] },
  });
  return provider;
}
export function discoveryMetadata(issuer: string) { return { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/me`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], scopes_supported: ["openid", "profile", "email", "offline_access"] }; }
