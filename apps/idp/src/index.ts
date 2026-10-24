import Fastify from "fastify";
import { createOidcProvider } from "@nexora/oidc";

const issuer = process.env.PUBLIC_ISSUER ?? "https://id.nexora-studios.tech";
const app = Fastify({ logger: true });
const provider = createOidcProvider({ issuer, findAccount: async () => undefined });
app.get("/health", async () => ({ status: "ok" }));
app.all("/.well-known/openid-configuration", async (_request, reply) => reply.send({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], code_challenge_methods_supported: ["S256"] }));
app.all("/*", async (request, reply) => {
  const callback = provider.callback() as (req: unknown, res: unknown) => unknown;
  return callback(request.raw, reply.raw);
});
export { app };
export async function start() { await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) }); }
if (process.env.NODE_ENV !== "test") void start();

