// Migration runner placeholder; real runner arrives with the first migration.
import { exit } from "node:process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  exit(1);
}
console.log("migrate: no migrations yet (skeleton)");
