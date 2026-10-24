import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

config();

export * from "./schema/index.js";
export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string = process.env.DATABASE_URL ?? "") {
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

