import { Pool, type PoolClient } from "pg";
import { databaseConnectionString } from "./access";

const globalDb = globalThis as typeof globalThis & { deflectionPool?: Pool };
export function database() {
  const connectionString = databaseConnectionString();
  return globalDb.deflectionPool ??= new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10000 });
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
