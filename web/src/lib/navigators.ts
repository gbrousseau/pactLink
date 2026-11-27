import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkflowError, type User } from "./access";
import { database, transaction } from "./db";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  groupId: z.string().trim().min(1).max(100),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d().\s\-x]{7,40}$/i)]),
  active: z.boolean(),
});
export type NavigatorProfile = z.infer<typeof profileSchema>;
export type NavigatorRow = { id: string; display_name: string; group_id: string; group_name: string; email: string; phone: string; active: boolean };

export async function listNavigators(user: User) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can manage navigators.", "forbidden");
  return (await database().query<NavigatorRow>(`SELECT u.id,u.display_name,u.group_id,g.name AS group_name,u.email,u.phone,u.active
    FROM app_users u JOIN app_groups g ON g.id=u.group_id WHERE u.role='editor' ORDER BY u.display_name,u.id`)).rows;
}

export async function saveNavigator(user: User, input: unknown, id?: string) {
  if (user.role !== "admin") throw new WorkflowError("Only administrators can manage navigators.", "forbidden");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success || (id && !z.string().min(1).max(100).safeParse(id).success)) throw new WorkflowError("Enter a valid name, group, email and phone.", "invalid");
  return transaction(async (client) => {
    const group = await client.query("SELECT 1 FROM app_groups WHERE id=$1", [parsed.data.groupId]);
    if (!group.rowCount) throw new WorkflowError("Select an available group.", "invalid");
    const target = id ?? randomUUID();
    if (id) {
      const updated = await client.query(`UPDATE app_users SET display_name=$2,group_id=$3,email=$4,phone=$5,active=$6
        WHERE id=$1 AND role='editor' RETURNING id`, [target, parsed.data.displayName, parsed.data.groupId, parsed.data.email, parsed.data.phone, parsed.data.active]);
      if (!updated.rowCount) throw new WorkflowError("Navigator not found.", "missing");
    } else {
      await client.query("INSERT INTO app_users(id,display_name,role,group_id,email,phone,active) VALUES ($1,$2,'editor',$3,$4,$5,$6)",
        [target, parsed.data.displayName, parsed.data.groupId, parsed.data.email, parsed.data.phone, parsed.data.active]);
    }
    await client.query("INSERT INTO audit_events(actor_id,action,changed_fields) VALUES ($1,$2,$3)",
      [user.id, id ? "navigator_update" : "navigator_create", [target, "profile"]]);
    return target;
  });
}
