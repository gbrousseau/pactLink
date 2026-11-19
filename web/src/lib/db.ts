import { Pool, type PoolClient } from "pg";
import { developmentEnabled } from "./access";

const globalDb = globalThis as typeof globalThis & { deflectionPool?: Pool };
export function database() {
  if (!developmentEnabled()) throw new Error("This prototype is blocked outside explicit development mode.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. See .env.example.");
  return globalDb.deflectionPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}
export async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
