export type Role = "viewer" | "editor" | "reviewer" | "admin";
export type User = { id: string; display_name: string; role: Role; group_id: string; group_name: string };

export function developmentEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.DEV_AUTH_ENABLED === "true";
}
export function hostedDemoEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" &&
    env.DEMO_MODE_ENABLED === "true" &&
    !!env.DEMO_DATABASE_URL?.trim();
}
export function demoAccessEnabled(env: NodeJS.ProcessEnv = process.env) {
  return developmentEnabled(env) || hostedDemoEnabled(env);
}
export function databaseConnectionString(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production") {
    const demoDatabaseUrl = env.DEMO_DATABASE_URL?.trim();
    if (env.DEMO_MODE_ENABLED === "true" && !demoDatabaseUrl) {
      throw new Error("DEMO_DATABASE_URL is required when hosted demo mode is enabled.");
    }
    if (!demoDatabaseUrl || !hostedDemoEnabled(env)) {
      throw new Error("This prototype is blocked outside explicit hosted demo mode.");
    }
    return demoDatabaseUrl;
  }
  if (!developmentEnabled(env)) {
    throw new Error("This prototype is blocked outside explicit development mode.");
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required. See .env.example.");
  return databaseUrl;
}
export function canView(user: User, groupId: string) {
  return user.role === "admin" || user.group_id === groupId;
}
export function canEdit(user: User, groupId: string) {
  return (user.role === "editor" || user.role === "admin") && canView(user, groupId);
}
export function canReview(user: User, groupId: string) {
  return (user.role === "reviewer" || user.role === "admin") && canView(user, groupId);
}
export class WorkflowError extends Error {
  constructor(message: string, public readonly code: "forbidden" | "conflict" | "invalid" | "missing") {
    super(message);
  }
}
