import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveSubmission, getSubmission, listSubmissions, getAudit, getRevisions, changeArchive, searchSchema } from "../src/lib/submissions";
import { database } from "../src/lib/db";
import type { User } from "../src/lib/access";
import type { Answers } from "../src/lib/intake-validation";

const integration = process.env.TEST_DATABASE_ADMIN_URL;
const suite = integration ? describe : describe.skip;
const north: User = { id: "north-editor", display_name: "North", role: "editor", group_id: "north", group_name: "North" };
const south: User = { ...north, id: "south-editor", group_id: "south" };
const viewer: User = { ...north, id: "north-viewer", role: "viewer" };
const admin: User = { ...north, id: "demo-admin", role: "admin" };
const answers: Answers = { name: "Synthetic Test Record", dob: "1990-01-01", programType: "Deflection", date: "2026-01-01", navigator: "Demo Navigator" };
let management: Pool;
let testName: string;
async function seedSubmitted(user: User, value: Answers = answers) {
  const id = await saveSubmission(user, value);
  await database().query(
    "UPDATE submissions SET status='submitted',revision=2,updated_at=now() WHERE id=$1",
    [id],
  );
  await database().query(
    "INSERT INTO audit_events(actor_id,action,submission_id,changed_fields,revision) VALUES ($1,'test_seed_submit',$2,ARRAY['status'],2)",
    [user.id, id],
  );
  await database().query(
    "INSERT INTO form_revisions(submission_id,revision,answers,status,actor_id) VALUES ($1,2,$2,'submitted',$3)",
    [id, JSON.stringify(value), user.id],
  );
  return id;
}
suite("PostgreSQL workflow (isolated temporary database)", () => {
  beforeAll(async () => {
    management = new Pool({ connectionString: integration });
    testName = `intake_test_${randomUUID().replaceAll("-", "")}`;
    await management.query(`CREATE DATABASE "${testName}"`);
    const url = new URL(integration!); url.pathname = `/${testName}`;
    process.env.DATABASE_URL = url.toString();
    await database().query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => {
    if (management) {
      if (testName) {
        await database().end();
        await management.query(`DROP DATABASE "${testName}"`);
      }
      await management.end();
    }
  });
  it("persists, scopes reads and counts, rejects viewers, and audits changes", async () => {
    const id = await saveSubmission(north, answers);
    expect((await getSubmission(north, id))?.answers.name).toBe(answers.name);
    expect(await getSubmission(south, id)).toBeNull();
    expect((await listSubmissions(south, searchSchema.parse({}))).total).toBe(0);
    expect((await listSubmissions(admin, searchSchema.parse({}))).total).toBe(1);
    expect(await getAudit(south, id)).toEqual([]);
    await expect(saveSubmission(viewer, answers)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveSubmission(south, answers, id, 1)).rejects.toMatchObject({ code: "missing" });
    expect((await getSubmission(north, id))?.revision).toBe(1);
    await saveSubmission(north, { ...answers, phone: "503-555-0100" }, id, 1);
    await expect(saveSubmission(north, answers, id, 1)).rejects.toMatchObject({ code: "conflict" });
    expect((await getSubmission(north, id))?.revision).toBe(2);
    expect((await getSubmission(north, id))?.status).toBe("draft");
    expect((await getRevisions(north, id)).map((version) => version.revision)).toEqual([2, 1]);
    expect((await getRevisions(north, id))[1].answers.phone).toBeUndefined();
    expect(await getRevisions(south, id)).toEqual([]);
    const events = await getAudit(north, id);
    expect(events.some((event) => event.action === "save_draft" && event.changed_fields.includes("phone"))).toBe(true);
  });
  it("saves edits to existing submitted records as drafts", async () => {
    const id = await seedSubmitted(north);
    await saveSubmission(north, { ...answers, phone: "503-555-0100" }, id, 2);
    expect((await getSubmission(north, id))?.status).toBe("draft");
    expect((await getSubmission(north, id))?.revision).toBe(3);
    expect((await getRevisions(north, id))[0].status).toBe("draft");
  });
  it("archives without deletion and restores only legacy submitted records", async () => {
    const id = await seedSubmitted(north);
    await changeArchive(north, id, 2, false);
    expect((await getSubmission(north, id))?.status).toBe("archived");
    expect((await listSubmissions(north, searchSchema.parse({ status: "archived" }))).records.some((row) => row.id === id)).toBe(true);
    await expect(saveSubmission(north, answers, id, 3)).rejects.toMatchObject({ code: "invalid" });
    await changeArchive(north, id, 3, true);
    expect((await getSubmission(north, id))?.status).toBe("submitted");
    await expect(changeArchive(north, id, 4, true)).rejects.toMatchObject({ code: "invalid" });
  });
  it("allows exactly one of two concurrent edits against the same revision", async () => {
    const id = await saveSubmission(north, answers);
    const result = await Promise.allSettled([
      saveSubmission(north, { ...answers, phone: "503-555-0101" }, id, 1),
      saveSubmission(north, { ...answers, phone: "503-555-0102" }, id, 1),
    ]);
    expect(result.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    expect((await getSubmission(north, id))?.revision).toBe(2);
    expect(await getRevisions(north, id)).toHaveLength(2);
  });
  it("paginates, filters by program and navigator, and preserves draft blank dates", async () => {
    for (let index = 0; index < 21; index++) {
      await saveSubmission(south, { name: `Synthetic Pagination ${String(index).padStart(2, "0")}`, programType: "Active Outreach Referral", navigator: "Paging Demo" });
    }
    const first = await listSubmissions(south, searchSchema.parse({ program: "Active Outreach Referral", navigator: "Paging", sort: "name", direction: "asc" }));
    const second = await listSubmissions(south, searchSchema.parse({ page: 2, sort: "name", direction: "asc" }));
    expect(first.total).toBe(21); expect(first.records).toHaveLength(20); expect(second.records).toHaveLength(1);
    expect(first.records[0].date_of_birth).toBeNull();
    expect(first.records[0].participant_name).toBe("Synthetic Pagination 00");
    expect(second.records[0].participant_name).toBe("Synthetic Pagination 20");
    expect((await listSubmissions(south, searchSchema.parse({ program: "Deflection" }))).total).toBe(0);
    expect((await listSubmissions(south, searchSchema.parse({ from: "2000-01-01", to: "2000-12-31" }))).total).toBe(0);
  });
  it("rolls back the record mutation if the audit insert fails", async () => {
    const id = await saveSubmission(north, answers);
    await database().query(`CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='save_draft' THEN RAISE EXCEPTION 'Simulated audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_test_audit();`);
    try {
      await expect(saveSubmission(north, { ...answers, name: "Should Roll Back" }, id, 1)).rejects.toThrow("Simulated audit failure");
      expect((await getSubmission(north, id))?.participant_name).toBe(answers.name);
      expect((await getSubmission(north, id))?.revision).toBe(1);
    } finally {
      await database().query("DROP TRIGGER test_audit_failure ON audit_events; DROP FUNCTION fail_test_audit();");
    }
  });
  it("makes audit events append-only and escapes search wildcards", async () => {
    await expect(database().query("UPDATE audit_events SET action='forged'")).rejects.toThrow("append-only");
    expect((await listSubmissions(north, searchSchema.parse({ q: "%" }))).total).toBe(0);
    expect((await listSubmissions(north, searchSchema.parse({ q: "Synthetic", sort: "name", direction: "asc" }))).total).toBeGreaterThan(0);
  });
});
