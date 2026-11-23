import { describe, expect, it } from "vitest";
import { defaultReportRange, demoReportingSource, reportRangeSchema } from "../src/lib/demo-report";
import type { User } from "../src/lib/access";

const admin: User = { id: "demo-admin", display_name: "Demo", role: "admin", group_id: "north", group_name: "North" };
describe("synthetic dashboard reporting", () => {
  it("uses explicit fixture totals, not database records", async () => {
    const report = await demoReportingSource.getReport(admin, defaultReportRange, "north");
    expect(report).toMatchObject({ source: "synthetic", groupId: "north", reviewed: 6, accepted: 5, servicesStarted: 5, completed: 2 });
    expect(report.programs.reduce((sum, row) => sum + row.count, 0)).toBe(report.reviewed);
  });
  it("uses each event date inclusively, including cases reviewed outside the range", async () => {
    const report = await demoReportingSource.getReport(admin, { from: "2026-04-04", to: "2026-04-04" }, "north");
    expect(report.reviewed).toBe(0);
    expect(report.completed).toBe(1);
    expect(report.outcomes.find((row) => row.label === "Completed")?.count).toBe(1);
  });
  it("handles empty periods and rejects invalid ranges", async () => {
    const report = await demoReportingSource.getReport(admin, { from: "2030-01-01", to: "2030-01-01" }, "north");
    expect(report.reviewed + report.accepted + report.servicesStarted + report.completed).toBe(0);
    expect(reportRangeSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
    await expect(demoReportingSource.getReport(admin, { from: "2026-02-01", to: "2026-01-01" }, "north")).rejects.toMatchObject({ code: "invalid" });
  });
  it("restricts every non-admin role to its group and allows admins to view each group", async () => {
    for (const role of ["viewer", "editor", "reviewer"] as const) {
      const north = { ...admin, role };
      const south = { ...north, group_id: "south", group_name: "South" };
      expect((await demoReportingSource.getReport(north, defaultReportRange, "north")).groupId).toBe("north");
      expect((await demoReportingSource.getReport(south, defaultReportRange, "south")).groupId).toBe("south");
      await expect(demoReportingSource.getReport(north, defaultReportRange, "south")).rejects.toMatchObject({ code: "forbidden" });
      await expect(demoReportingSource.getReport(south, defaultReportRange, "north")).rejects.toMatchObject({ code: "forbidden" });
    }
    const north = await demoReportingSource.getReport(admin, defaultReportRange, "north");
    const south = await demoReportingSource.getReport(admin, defaultReportRange, "south");
    expect(south).toMatchObject({ groupId: "south", reviewed: 6, accepted: 5, servicesStarted: 4, completed: 1 });
    expect(south.programs).not.toEqual(north.programs);
    await expect(demoReportingSource.getReport(admin, defaultReportRange, "")).rejects.toMatchObject({ code: "invalid" });
    expect((await demoReportingSource.getReport(admin, defaultReportRange, "other")).reviewed).toBe(0);
  });
});
