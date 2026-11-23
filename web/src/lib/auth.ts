import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database, transaction } from "./db";
import { demoAccessEnabled, type User } from "./access";

const cookieName = "deflection_dev_session";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function currentUser(): Promise<User | null> {
  if (!demoAccessEnabled()) return null;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const result = await database().query<User>(
    `SELECT u.id, u.display_name, u.role, u.group_id, g.name AS group_name
     FROM sessions s JOIN app_users u ON u.id=s.user_id JOIN app_groups g ON g.id=u.group_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '20 minutes' AND u.active=true`,
    [hash(token)],
  );
  if (!result.rows[0]) return null;
  await database().query("UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1", [hash(token)]);
  return result.rows[0];
}
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function createSession(accountId: string) {
  if (!demoAccessEnabled()) throw new Error("Demo login is disabled.");
  const token = randomBytes(32).toString("hex");
  await transaction(async (client) => {
    const account = await client.query("SELECT id FROM app_users WHERE id=$1 AND active=true", [accountId]);
    if (!account.rowCount) throw new Error("Unknown development account.");
    await client.query("DELETE FROM sessions WHERE expires_at<now()");
    await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')", [hash(token), accountId]);
    await client.query("INSERT INTO audit_events(actor_id,action) VALUES ($1,'login')", [accountId]);
  });
  (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
}
export async function destroySession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (token && demoAccessEnabled()) {
    await transaction(async (client) => {
      const result = await client.query<{ user_id: string }>("DELETE FROM sessions WHERE token_hash=$1 RETURNING user_id", [hash(token)]);
      if (result.rows[0]) await client.query("INSERT INTO audit_events(actor_id,action) VALUES ($1,'logout')", [result.rows[0].user_id]);
    });
  }
  (await cookies()).delete(cookieName);
}
