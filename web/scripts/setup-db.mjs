import { readFile } from "node:fs/promises";
import pg from "pg";

const mode = process.argv[2] ?? "development";
let connectionString;
if (mode === "--demo") {
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE_ENABLED !== "true") {
    throw new Error("Hosted demo migrations require NODE_ENV=production and DEMO_MODE_ENABLED=true.");
  }
  const demoDatabaseUrl = process.env.DEMO_DATABASE_URL?.trim();
  if (!demoDatabaseUrl) throw new Error("DEMO_DATABASE_URL is required for hosted demo migrations.");
  connectionString = demoDatabaseUrl;
} else if (mode === "development") {
  if (process.env.DEV_AUTH_ENABLED !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("Database setup is allowed only in explicit non-production development mode.");
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  connectionString = databaseUrl;
} else {
  throw new Error("Use the development setup command or the explicit --demo mode.");
}
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('deflection_schema_migrations'))");
  await client.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const migration of ["002-review-workflow.sql", "003-intake-import.sql", "004-import-removal.sql", "005-redcap-prototype.sql", "006-consent.sql", "007-screening-services.sql", "008-phase-review-notes.sql", "009-program-completion.sql"]) {
    const applied = await client.query("SELECT name FROM schema_migrations WHERE name=$1", [migration]);
    if (!applied.rowCount) {
      await client.query(await readFile(new URL(`../db/${migration}`, import.meta.url), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [migration]);
    }
  }
  await client.query("COMMIT");
  console.log(mode === "--demo"
    ? "Hosted demo schema and synthetic accounts are ready."
    : "Development schema and synthetic login accounts are ready.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
