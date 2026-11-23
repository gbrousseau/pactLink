import { describe, expect, it } from "vitest";
import { availableChartViews } from "../src/lib/chart-options";
import { defaultReportRange, demoReportingSource } from "../src/lib/demo-report";
import type { User } from "../src/lib/access";

const admin: User = { id: "demo-admin", display_name: "Demo", role: "admin", group_id: "north", group_name: "North" };
describe("chart suitability", () => {
  it("only offers pie when a declared whole matches valid nonzero counts", () => {
    const rows = [{ label: "A", count: 2 }, { label: "B", count: 3 }];
    expect(availableChartViews(rows, { comparableCounts: true, partition: { denominator: 5, label: "cases" } })).toEqual(["list", "table", "bar", "pie"]);
    expect(availableChartViews(rows, { comparableCounts: true, partition: { denominator: 6, label: "cases" } })).toEqual(["list", "table", "bar"]);
    expect(availableChartViews(rows, { comparableCounts: true })).toEqual(["list", "table", "bar"]);
    expect(availableChartViews([{ label: "A", count: 0 }], { comparableCounts: true, partition: { denominator: 0, label: "cases" } })).toEqual(["list", "table", "bar"]);
  });
  it("rejects charting non-comparable or invalid counts", () => {
    expect(availableChartViews([{ label: "A", count: 1 }], { comparableCounts: false, partition: { denominator: 1, label: "cases" } })).toEqual(["list", "table"]);
    for (const count of [-1, 0.5, NaN, Infinity]) {
      expect(availableChartViews([{ label: "A", count }], { comparableCounts: true, partition: { denominator: count, label: "cases" } })).toEqual(["list", "table"]);
    }
  });
  it("the demo's opted-in program and contact categories partition reviewed cases across ranges", async () => {
    for (const range of [defaultReportRange, { from: "2026-04-04", to: "2026-04-04" }, { from: "2026-01-08", to: "2026-03-03" }]) {
      const report = await demoReportingSource.getReport(admin, range, "north");
      for (const rows of [report.programs, report.contacts]) {
        expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(report.reviewed);
        const options = availableChartViews(rows, { comparableCounts: true, partition: { denominator: report.reviewed, label: "cases" } });
        expect(options.includes("pie")).toBe(report.reviewed > 0);
      }
    }
  });
});
