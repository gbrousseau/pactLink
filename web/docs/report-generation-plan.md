# Dashboard and Report Generation Plan

**Status:** Deferred — for client discovery and requirements confirmation.  
**Implementation:** A synthetic-only dashboard demonstration is available after
login. Its group-scoped reports use fixed fictional fixtures, not Intake records,
and must not be used for program evaluation, budget, or grant decisions. Real
report calculations remain deferred until definitions and source data are resolved.

The target report layout is illustrated by the client-provided
`report_screenshot-1.png` and `report_screenshot-2.png`. The screenshots show a
program-level report with case-review totals, deflection and conditional-discharge
outcomes, ineligibility and declined-case categories, demographics, referral-source
counts, substance occurrence, and case counts over time.

The current application has an Intake workflow with draft saves. It does not yet
capture all of the finalized case outcomes, eligibility information, referral-source
details, assessment results, or other values required to produce the illustrated
report. The numbers and categories shown in the screenshots are examples of the
desired presentation; they are not yet a validated calculation specification.

## Dashboard as the post-login landing page

After a successful login, take users to a responsive dashboard rather than directly
to the form library. Keep the form library and other authorized workflows accessible
from the dashboard and main navigation. Authentication, session expiry, and group
authorization remain governed by the
[login and authentication plan](./login-and-authentication-plan.md).

The dashboard is a shared landing page, but its content must be role-aware:

- All authenticated roles may view dashboard reports for their own group.
  Administrators may see reports for all groups, separately, or select a group.
  The server must enforce this scope on every report request and response.
- Report approval, export, and submission are not implemented. Their permissions
  and agency privacy requirements require confirmation before those capabilities
  are added; dashboard visibility alone does not grant those actions.
- Non-administrators must not receive other groups' report data in server
  responses, page payloads, or APIs merely because the UI hides it.
- Design for desktop, tablet, and mobile, with accessible controls, clear loading,
  empty, incomplete-data, and error states. Do not display invented or zero-valued
  metrics when data or calculation definitions are unavailable.

The eventual group reporting area should initially display the most current
available approved data, with an adjustable date range. The demo instead shows
a fixed, explicitly dated sample and does not claim to represent current program
data. Apply the same approved definitions
and source data to dashboard visualizations and report previews. Display the
selected range and data-as-of time; do not silently substitute stale snapshots
for current results. The default range, qualifying date field, refresh behavior,
and treatment of changes after the selected period remain client decisions.
Where dashboard summaries and formal reports have
different date bases, filters, or refresh times, label those differences explicitly.
Dashboard access does not imply authorization to export, approve, or submit a
report. Whether the dashboard needs non-report widgets, additional role-specific
content, or configurable layouts remains a client-discovery decision.

## Client discovery: decisions required

Confirm these with the client and program stakeholders before defining report logic:

1. **Reporting period**
   - Does the date range use case-review date, eligibility-decision date, referral
     date, enrollment date, completion date, or another event?
   - Are multiple date-based report views needed?
2. **Counting unit**
   - Does each metric count people, referrals, enrollment episodes, charges, or
     another unit?
   - How are repeat referrals, reopened cases, and people with multiple enrollments
     handled?
3. **Cohort and lifecycle**
   - Must reports include pending, declined, ineligible, withdrawn, participating,
     completed, deceased, and other outcomes?
   - How are outcome changes, corrections, and cases spanning reporting periods
     represented?
4. **Metric definitions**
   - What precisely qualifies as eligible, offered, entered, participating,
     successfully completed, deceased, declined, withdrawn, or dismissed?
   - Are categories mutually exclusive? What happens when a case could fit more
     than one category?
   - Which event moves a case from one category to another?
5. **Demographic measures**
   - What is the denominator for each percentage?
   - Are unknown, not collected, and declined-to-answer excluded, included, or
     reported as separate categories?
   - Which categories and small-cell privacy suppression rules are required?
6. **Referral sources**
   - What authoritative agency/source list is needed, and who maintains it?
   - Does a report count first contact, referral pathway, referring agency, or
     another source?
   - How are contracted services and multi-agency referrals counted?
7. **Substance occurrence**
   - Which approved assessment or screening supplies the measure?
   - Are results self-reported, assessed, or otherwise identified?
   - What are the substance categories, and what exact rule defines
     “multi-substance”?
8. **Report output and approvals**
   - Which formats are required (print/PDF, CSV, or another format)?
   - Which narrative notes and footnotes are editable for each reporting run?
   - Who reviews and approves a report before it is considered final?
   - Must approved historical report results remain reproducible after case records
     are corrected?
9. **Dashboard experience**
   - What should each role see immediately after login, beyond authorized
     navigation? Are any summaries appropriate for non-administrators?
   - Which report measures should appear on the dashboard, what
     default date range and refresh frequency should they use, and how should the
     current preview distinguish itself from approved report snapshots?
   - Which dashboard shortcuts, filters, accessibility needs, and mobile layouts
     are required? What happens when report data is unavailable or incomplete?
10. **External API, later phase**
   - Obtain the third party's schema, field mapping, required fields, authentication,
     acknowledgments, validation errors, retry expectations, and authorization
     requirements.
   - Confirm whether reporting and API submission use the same validated data, while
     remaining distinct user-authorized workflows.

Capture decisions, examples, and client sign-off in a metric/data dictionary before
implementation. For each measure, document the counting unit, qualifying event,
date field, included/excluded statuses, denominator, missing-value handling,
suppression rule, and data source.

## Candidate data model additions

Choose the authoritative source after client discovery. Prefer structured,
validated, versioned fields on the relevant case/form rather than report-only
free-text where a fact describes an individual case.

- Case review/eligibility decision date and decision.
- Program type, offer made, offer outcome, and standardized reason categories.
- Referral, enrollment, participation, and lifecycle outcome events with dates.
- Program completion, withdrawal, deceased, and other approved dispositions.
- Standardized referring agency/source identity and relationship to the referral.
- Structured screening/assessment type, date, and reportable results.
- Reportable demographic values with distinct unknown/not-collected/declined states.
- Provenance for entry, correction, and status change: actor, timestamp, and
  applicable source or record revision.
- Where policy permits, an admin-managed reporting-period supplement for approved
  report title, narrative, footnotes, and correction notes. Keep this separate
  from individual case facts and retain its author/change history.

Avoid adding every measure to the Intake form automatically. Some fields may belong
in eligibility, referral, screening/services, or completion workflows instead.
Reports should not infer clinical outcomes from an unanswered field or conflate
unknown with no.

## Proposed administrator dashboard reporting workflow

1. Administrator opens the dashboard after login and selects the reporting area,
   date range, documented cohort/date basis, and approved filters.
2. Server checks access and evaluates source-data completeness and consistency.
3. Preview displays measures, counts, denominators, missing-data warnings, and
   applicable suppression.
4. Administrator reviews and explicitly approves or cancels the run.
5. Approved output is generated in the agreed formats.
6. Save a versioned report snapshot, calculation/template version, parameters,
   generation time, and generating/approving administrators. Keep later corrections
   from silently overwriting historical approved results.
7. Audit viewing, generation, approval, and exports.

The current review workflow stores immutable approved Intake versions separately
from working drafts. Reporting over changes must use approved source versions or
other approved, dated events according to the final metric definitions; a reviewer
approving an Intake is not necessarily the participant completing a program.
Confirm which version or event applies to each date range, including corrections,
before calculating metrics. Exclude working drafts and removed imports from
completed-intake reporting unless the client explicitly approves a different
definition.

Dashboard reports must be restricted to the user's group on the server, with
administrators permitted to view all groups. Permissions for future report
approval, history, downloads, and exports require client and agency confirmation.
Generated reports and saved
snapshots are sensitive records too: apply the same approved authorization,
retention, handling, audit, and privacy controls. Assess CJIS, health-information,
substance-use confidentiality, and applicable state requirements with the
organization's designated authorities. Protect small or identifiable aggregate
cells according to policy.

Report generation must not transmit data to a third party. When API integration is
approved, create a separate explicit submission workflow with validation,
idempotency, protected delivery/audit records, retries, and acknowledgments.

## Delivery phases after discovery

1. Agree on dashboard content and role access, and approve the metric/data
   dictionary and cohort/date rules.
2. Implement the authorized dashboard landing page and navigation, without
   placeholder report numbers. Test login routing, session handling, and access
   for each role and group.
3. Implement structured source fields and lifecycle capture in the appropriate
   forms/workflows.
4. Add completeness, consistency, and missing-data validation.
5. Add group-scoped dashboard preview, calculations, visualizations, and agreed
   exports.
6. Add report approval, reproducible versioned snapshots, access auditing, and
   retention.
7. Design and implement third-party API submission from its approved specification
   as a separate phase.

The current demonstration does not complete the real-report phases: its
`ReportingSource` boundary returns fictional examples only. Replacing it requires
approved event capture, snapshot selection, authorization, privacy, and validated
metric definitions; swapping the data source alone does not establish compliance
or reporting accuracy.

## First milestone

Conduct client discovery and agree on the dashboard's role-specific content and the
report's date basis, counting unit,
cohort/lifecycle treatment, metric definitions, demographic denominators, referral
source, assessment source, output/approval process, and privacy requirements.
Review sample records or client-provided examples to confirm that the definitions
produce the expected results. Only then identify the missing fields and decide
which belong in Intake versus other workflows or the report-period supplement.
