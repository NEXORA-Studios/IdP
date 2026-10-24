import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "../../infra/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
