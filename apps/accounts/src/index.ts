import Fastify from "fastify";

const app = Fastify({ logger: true });
app.get("/health", async () => ({ status: "ok" }));
app.get("/", async () => ({ service: "nexora-accounts" }));
export { app };
export async function start() { await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3001) }); }
if (process.env.NODE_ENV !== "test") void start();

