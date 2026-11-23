import type { ReportBreakdown } from "./demo-report";

export type ChartView = "list" | "table" | "bar" | "pie";
export type ChartSemantics = {
  comparableCounts: boolean;
  partition?: { denominator: number; label: string };
};
export function availableChartViews(rows: ReportBreakdown[], semantics: ChartSemantics): ChartView[] {
  const views: ChartView[] = ["list", "table"];
  const validCounts = rows.length > 0 && rows.every((row) => Number.isSafeInteger(row.count) && row.count >= 0);
  if (!semantics.comparableCounts || !validCounts) return views;
  views.push("bar");
  const partition = semantics.partition;
  if (partition && Number.isSafeInteger(partition.denominator) && partition.denominator > 0 &&
      rows.reduce((sum, row) => sum + row.count, 0) === partition.denominator) {
    views.push("pie");
  }
  return views;
}
