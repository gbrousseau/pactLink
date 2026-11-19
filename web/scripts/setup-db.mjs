import { readFile } from "node:fs/promises";
import pg from "pg";

if (process.env.DEV_AUTH_ENABLED !== "true" || process.env.NODE_ENV === "production") {
  throw new Error("Database demo setup is allowed only in explicit development mode.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("Development schema and synthetic login accounts are ready.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
