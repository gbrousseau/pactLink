export type IntakeField = {
  key: string;
  label: string;
  type: "text" | "date" | "tel" | "single" | "multi";
  options?: readonly string[];
  required?: boolean;
  hint?: string;
  when?: { key: string; value: string };
};
export type IntakeSection = { title: string; description: string; fields: IntakeField[] };

export const programs = ["Conditional Discharge", "Deflection", "Active Outreach Referral"] as const;
const unknown = "Don't know";
const yesNo = ["Yes", "No", unknown];
export const housingOptions = [
  "Living in a tent", "Living in a vehicle", "Outside or other place not meant for habitation",
  "Emergency shelter", "Owns their own home", "Rental housing (with subsidy)",
  "Rental housing (without subsidy)", "Rental housing (subsidy status unknown)",
  "Health, psychiatric, or long-term care facility", "Personal residence (house/apartment/dorm)",
  "Staying with friends or family (couch surfing)", "Hotel or motel (paid with emergency shelter voucher)",
  "Hotel or motel (without shelter voucher)", "Transitional housing", "Safe Haven",
  "College dorm or student housing", "Permanent supportive housing", "Foster care or other group home setting",
  "Substance use treatment facility", "Staying with family (short-term arrangement)",
  "Staying with friends (short-term arrangement)", "Living with family (long-term or permanent)",
  "Living with friends (long-term or permanent)", "Homeless shelter", "Hotel/motel",
  "Jail/correctional facility", "Other", unknown,
] as const;

export const intakeSections: IntakeSection[] = [
  {
    title: "Participant",
    description: "Program and participant identity. Fields marked * are required when submitting, not when saving a draft.",
    fields: [
      { key: "programType", label: "Program type", type: "single", options: programs, required: true },
      { key: "name", label: "Name (first, middle, last)", type: "text", required: true },
      { key: "dob", label: "Date of birth", type: "date", required: true },
      { key: "race", label: "Race / ethnicity", type: "multi", options: [
        "American Indian/Alaska Native", "Black or African American", "Middle Eastern or North African",
        "Native Hawaiian or Pacific Islander or Asian", "Hispanic or Latino", "White",
        "Different Race", "Prefer Not to Answer", unknown,
      ] },
      { key: "gender", label: "Gender identity", type: "multi", options: [
        "Male", "Female", "Two-Spirit", "Transgender Man (Female to Male)",
        "Transgender Woman (Male to Female)", "Other", "Prefer Not to Answer", unknown,
      ] },
      { key: "orientation", label: "Sexual orientation", type: "multi", options: [
        "Straight", "Lesbian or Gay", "Bisexual", "Two-Spirit", "Different Term", "Prefer Not to Answer", unknown,
      ] },
      { key: "disability", label: "Disability / functional limitations", type: "multi",
        hint: "Because of a physical, mental, or emotional condition.",
        options: ["Hearing - Deaf or serious difficulty hearing", "Vision - Blind or serious difficulty seeing, even when wearing glasses",
          "Self-care - Difficulty dressing or bathing", "Cognition - Serious difficulty concentrating, remembering, or making decisions",
          "Mobility - Serious difficulty walking or climbing stairs", "Independent living - Difficulty doing errands alone",
          "None", unknown, "Other"] },
    ],
  },
  {
    title: "Housing and basic needs",
    description: "Capture the situation at intake. Unknown and unanswered are stored separately.",
    fields: [
      { key: "housing", label: "Housing situation at time of deflection", type: "multi", options: housingOptions },
      { key: "housingStable", label: "Is the housing situation stable?", type: "single", options: yesNo },
      { key: "housingSafe", label: "Is the housing situation safe?", type: "single", options: yesNo },
      { key: "employment", label: "Employment status", type: "multi", options: [
        "Full-time employment", "Part-time employment", "Not employed, looking for work",
        "Not employed, not looking for work", "Unemployment benefits", "Retired", "SSI/SSDI", "Student", "Other", unknown,
      ] },
      { key: "medicalNeeds", label: "Medical needs at time of deflection", type: "multi", options: [
        "Access to medications/prescriptions", "Emergent treatment (ED/urgent care)", "Access to primary care/basic medical care",
        "Chronic condition management", "Dental care", "None", unknown, "Other",
      ] },
      { key: "foodReceiving", label: "Currently receiving food assistance?", type: "single", options: yesNo },
      { key: "foodNeeded", label: "Need food assistance?", type: "single", options: yesNo },
      { key: "insurance", label: "Insurance status", type: "multi", options: [
        "Uninsured", "Insured", "OHP/Medicaid", "Medicare", "HIS", "VA health plan", "Private insurance", unknown, "Other",
      ] },
      { key: "language", label: "Preferred language for services", type: "multi", options: [
        "English", "Spanish", "Chinese", "Russian", "Vietnamese", "Other", unknown,
      ] },
    ],
  },
  {
    title: "Referral",
    description: "For officer interventions, the packet specifies the DA as first contact and contact location, and outreach referral as the handoff.",
    fields: [
      { key: "contactDate", label: "Date of first point of contact", type: "date" },
      { key: "firstContact", label: "Who was the first point of contact with the participant?", type: "multi",
        options: ["Law enforcement", "First responder (EMS, Fire)", "Mobile Crisis/Crisis Response Team",
          "Multi-disciplinary deflection response team", "Social worker", "Behavioral Health treatment provider Case manager",
          "Peer support worker/navigator", "District attorney's office", "Jail staff", "Deflection coordinator",
          "Community corrections staff (e.g. parole, probation, supervision)", "Other", unknown] },
      { key: "contactLocation", label: "Location of first point of contact", type: "multi",
        options: ["On the street (on view) - includes any public place", "Police department", "Fire station",
          "Emergency Department", "Hospital inpatient", "Homeless camp", "Residence",
          "In the community (e.g. FQHC, shelter, crisis center, or place providing services)", "Court", "Jail",
          "Community corrections (e.g. parole, probation)", "Other", unknown] },
      { key: "pathway", label: "Referral pathway", type: "multi", options: [
        "Active Outreach", "Naloxone Plus", "Officer Intervention", "First Responder and Officer Referral", "Other", unknown,
      ] },
      { key: "handoff", label: "Type of handoff", type: "multi", options: [
        "Instructions to contact or report to deflection team staff/coordinator", "Instructions to report to community court",
        "Instructions to report to BH provider for screening/assessment", "Referral to deflection team for outreach to participant",
        "Warm handoff at deflection drop-off center", "Warm handoff at stabilization/sobering center",
        "Warm handoff to peer", "Warm handoff on scene to deflection navigator/case manager", "Other", unknown,
      ] },
    ],
  },
  {
    title: "Eligibility and charges",
    description: "Record the determination, associated charges, and agreement to participate.",
    fields: [
      { key: "eligibilityDate", label: "Date of eligibility determination", type: "date" },
      { key: "eligibilityBy", label: "Who determined program eligibility?", type: "multi",
        hint: "For officer interventions, this should be the DA.",
        options: ["Law enforcement", "District attorney", "Defense attorney", "Program coordinator/navigator",
          "First responder (EMS, Fire)", "Mobile Crisis Team", "Behavioral Health provider", "Peer support worker",
          "Deflection operations team/work group", "Community corrections staff", "Other", unknown] },
      { key: "charges", label: "Charges or potential charges associated with this deflection event", type: "multi", options: [
        "PCS (user amounts)", "Violation/citation (e.g. low level quality of life crime)", "None", "Felony", "Other misdemeanor",
      ] },
      { key: "abeyance", label: "Were deflection-related charges held in abeyance?", type: "single", options: ["Yes", "No"] },
      { key: "qualified", label: "Did they qualify for the deflection program?", type: "single", options: ["Yes", "No"] },
      { key: "disqualification", label: "If applicable, why did they not qualify?", type: "multi",
        when: { key: "qualified", value: "No" }, options: [
          "Prior disqualifying conviction", "Charged with other crime at time of deflection encounter", "Pending warrant",
          "Victim with potential restitution", "Did not attend court appearance", "Community justice supervision",
          "Not a county resident", "Previous deflection involvement", "Other", unknown,
        ] },
      { key: "agreed", label: "Did they agree to enter the deflection program?", type: "single", options: ["Yes", "No"] },
    ],
  },
  {
    title: "Contact and attestation",
    description: "Signature capture is pending agency approval. This development form does not create a legally signed document.",
    fields: [
      { key: "phone", label: "Participant phone number", type: "tel" },
      { key: "emergencyName", label: "Emergency contact name", type: "text" },
      { key: "emergencyPhone", label: "Emergency contact phone number", type: "tel" },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "signatureName", label: "Participant name at attestation (not an electronic signature)", type: "text" },
      { key: "navigator", label: "Program navigator name", type: "text", required: true },
    ],
  },
];

export const intakeFields = intakeSections.flatMap((section) => section.fields);
export const otherOption = (field: IntakeField) =>
  field.options?.find((option) => ["Other", "Different Race", "Different Term"].includes(option));
