import { z } from "zod";
import { canView, WorkflowError, type User } from "./access";

export const reportRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((value) => value.from <= value.to, { message: "Start date must not follow end date." });
export type ReportRange = z.infer<typeof reportRangeSchema>;
export type ReportBreakdown = { label: string; count: number };
export type DashboardReport = {
  range: ReportRange;
  groupId: string;
  source: "synthetic";
  fixtureThrough: string;
  reviewed: number;
  accepted: number;
  servicesStarted: number;
  completed: number;
  programs: ReportBreakdown[];
  contacts: ReportBreakdown[];
  demographics: ReportBreakdown[];
  agencies: ReportBreakdown[];
  substances: ReportBreakdown[];
  outcomes: ReportBreakdown[];
  services: ReportBreakdown[];
};
export interface ReportingSource {
  getReport(user: User, range: ReportRange, groupId: string): Promise<DashboardReport>;
}

type DemoCase = {
  groupId?: string;
  reviewed: string; program: "Deflection" | "Conditional Discharge";
  contact: "Law enforcement" | "Community outreach" | "Other";
  demographic: "Group A" | "Group B" | "Not collected";
  agency?: "Example agency A" | "Example agency B";
  substance?: "Example substance A" | "Example substance B";
  accepted?: string; service?: { name: "Peer support" | "Housing support" | "Treatment", date: string };
  outcome?: { name: "Completed" | "Withdrawn" | "Declined", date: string };
};
const fixtures: DemoCase[] = [
  { reviewed: "2026-01-08", program: "Deflection", contact: "Law enforcement", demographic: "Group A", accepted: "2026-01-12", service: { name: "Peer support", date: "2026-01-20" }, outcome: { name: "Completed", date: "2026-04-04" } },
  { reviewed: "2026-02-11", program: "Conditional Discharge", contact: "Law enforcement", demographic: "Group B", accepted: "2026-02-25", service: { name: "Treatment", date: "2026-03-03" }, outcome: { name: "Completed", date: "2026-08-15" } },
  { reviewed: "2026-03-03", program: "Deflection", contact: "Community outreach", demographic: "Group A", accepted: "2026-03-06", service: { name: "Housing support", date: "2026-04-01" } },
  { reviewed: "2026-04-07", program: "Deflection", contact: "Other", demographic: "Not collected", outcome: { name: "Declined", date: "2026-04-12" } },
  { reviewed: "2026-05-10", program: "Conditional Discharge", contact: "Law enforcement", demographic: "Group B", accepted: "2026-05-14", service: { name: "Peer support", date: "2026-05-23" }, outcome: { name: "Withdrawn", date: "2026-09-10" } },
  { reviewed: "2026-06-02", program: "Deflection", contact: "Community outreach", demographic: "Group A", accepted: "2026-06-07", service: { name: "Treatment", date: "2026-07-01" } },
  { reviewed: "2026-07-18", program: "Conditional Discharge", contact: "Law enforcement", demographic: "Group B", accepted: "2026-08-01", service: { name: "Peer support", date: "2026-08-04" } },
  { reviewed: "2026-08-15", program: "Deflection", contact: "Community outreach", demographic: "Group A", accepted: "2026-08-18", service: { name: "Housing support", date: "2026-09-05" }, outcome: { name: "Completed", date: "2026-11-01" } },
  { reviewed: "2026-09-09", program: "Conditional Discharge", contact: "Other", demographic: "Not collected", outcome: { name: "Declined", date: "2026-09-20" } },
  { reviewed: "2026-10-12", program: "Deflection", contact: "Law enforcement", demographic: "Group B", accepted: "2026-10-18", service: { name: "Treatment", date: "2026-11-03" } },
  { reviewed: "2026-11-02", program: "Deflection", contact: "Community outreach", demographic: "Group A", accepted: "2026-11-04", service: { name: "Peer support", date: "2026-11-12" } },
  { reviewed: "2026-11-10", program: "Conditional Discharge", contact: "Law enforcement", demographic: "Group B", accepted: "2026-11-17" },
];
const examples = fixtures.map((item, index): DemoCase => ({
  ...item,
  groupId: index % 4 < 2 ? "north" : "south",
  agency: index % 2 === 0 ? "Example agency A" : "Example agency B",
  substance: index % 3 === 0 ? "Example substance A" : index % 3 === 1 ? "Example substance B" : undefined,
}));
export const fixtureThrough = "2026-11-17";
export const defaultReportRange: ReportRange = { from: "2026-01-01", to: fixtureThrough };
function breakdown(labels: readonly string[], values: string[]): ReportBreakdown[] {
  return labels.map((label) => ({ label, count: values.filter((value) => value === label).length }));
}
export const demoReportingSource: ReportingSource = {
  async getReport(user, input, groupId) {
    if (typeof groupId !== "string" || !groupId.trim()) throw new WorkflowError("Select a valid report group.", "invalid");
    if (!canView(user, groupId)) throw new WorkflowError("You cannot view reports for another group.", "forbidden");
    const parsed = reportRangeSchema.safeParse(input);
    if (!parsed.success) throw new WorkflowError("Enter a valid start and end date in chronological order.", "invalid");
    const range = parsed.data;
    const includes = (date: string | undefined) => !!date && date >= range.from && date <= range.to;
    const scoped = examples.filter((item) => item.groupId === groupId);
    const reviewed = scoped.filter((item) => includes(item.reviewed));
    const services = scoped.flatMap((item) => item.service && includes(item.service.date) ? [item.service.name] : []);
    const outcomes = scoped.flatMap((item) => item.outcome && includes(item.outcome.date) ? [item.outcome.name] : []);
    return {
      range, groupId, source: "synthetic", fixtureThrough,
      reviewed: reviewed.length, accepted: scoped.filter((item) => includes(item.accepted)).length,
      servicesStarted: services.length, completed: outcomes.filter((name) => name === "Completed").length,
      programs: breakdown(["Deflection", "Conditional Discharge"], reviewed.map((item) => item.program)),
      contacts: breakdown(["Law enforcement", "Community outreach", "Other"], reviewed.map((item) => item.contact)),
      demographics: breakdown(["Group A", "Group B", "Not collected"], reviewed.map((item) => item.demographic)),
      agencies: breakdown(["Example agency A", "Example agency B"], reviewed.map((item) => item.agency ?? "Not collected")),
      substances: breakdown(["Example substance A", "Example substance B", "Not collected"], reviewed.map((item) => item.substance ?? "Not collected")),
      outcomes: breakdown(["Completed", "Withdrawn", "Declined"], outcomes),
      services: breakdown(["Peer support", "Housing support", "Treatment"], services),
    };
  },
};
