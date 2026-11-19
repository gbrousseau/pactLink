export type Role = "viewer" | "editor" | "admin";
export type User = { id: string; display_name: string; role: Role; group_id: string; group_name: string };

export function developmentEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.DEV_AUTH_ENABLED === "true";
}
export function canView(user: User, groupId: string) {
  return user.role === "admin" || user.group_id === groupId;
}
export function canEdit(user: User, groupId: string) {
  return user.role !== "viewer" && canView(user, groupId);
}
export class WorkflowError extends Error {
  constructor(message: string, public readonly code: "forbidden" | "conflict" | "invalid" | "missing") {
    super(message);
  }
}
