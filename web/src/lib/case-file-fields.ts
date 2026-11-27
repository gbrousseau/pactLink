import type { CaseFileAnswers } from "./case-file";

export const caseFileLabels = {
  firstName: "First name", middleName: "Middle name", lastName: "Last name", dob: "Date of birth", address: "Address",
  phone: "Phone", leContact: "LE contact", arrestDate: "Arrest date", leoName: "LEO name",
  leContactLocation: "LE contact location", agency: "Agency", agencyReportNumber: "Agency report #",
  incidentSummary: "Incident summary", reviewNote: "Note for reviewer",
} satisfies Partial<Record<keyof CaseFileAnswers, string>>;
