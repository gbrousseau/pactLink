# Deflection Intake Pilot

Each referral begins with Consent and then Intake, followed by Screening and
Services and Program Completion after approval of the preceding phases.
Internal identifiers, database tables, URLs, and original template references
retain their `intake` names.

Next.js App Router, TypeScript, Tailwind CSS, Zod, and PostgreSQL development/demo application.
The Intake form is mapped from `../forms_screenshots-06.png` through
`../forms_screenshots-08.png` (packet version 09.24.2026).

## Safety boundary

**Use synthetic data only, including any uploaded PDFs. This is not a CJIS-approved or production-ready system.**

Local database operations and demo login require `DEV_AUTH_ENABLED=true` and refuse
`NODE_ENV=production`. A hosted, synthetic-only demo may explicitly run with
`NODE_ENV=production`, `DEMO_MODE_ENABLED=true`, and `DEMO_DATABASE_URL` set.
Without that complete hosted-demo configuration, production login and database
access remain blocked. This is not a real-data production mode; do not use it for
legal, CJI, health, or substance-use records.

The checked-in database password is a public, local-demo value, not a production
credential. PostgreSQL listens on loopback only. Demo accounts do not use passwords
or MFA. Anyone able to access a hosted demo login can select any demo role, including
administrator; deploy it only with synthetic data and restrict service access using
Render's available access controls where appropriate. Application
group isolation therefore demonstrates authorization behavior, not secure identity.
The Docker database uses an owner account; its immutable-history triggers do not
protect against infrastructure owners. Encryption, validated cryptographic modules,
independent security logging, least-privilege database accounts, agency approval,
personnel obligations, and an approved identity provider are still required.

Deferred planning documents:

- [Login and authentication plan](./docs/login-and-authentication-plan.md)
- [Report generation plan](./docs/report-generation-plan.md)
- [Administration, API settings, and profile plan](./docs/administration-and-profiles-plan.md)
- [Database backup, migration, and recovery plan](./docs/database-backup-and-migration-plan.md)

## Local setup

Requirements: Node.js 22.18+ and Docker Compose.

```sh
cd /home/robert/code/cjsIngest/web
npm install
cp .env.example .env.local
docker compose up -d --wait db
npm run db:setup
npm run dev -- --port 3100
```

Open <http://127.0.0.1:3100>. The database uses port **55439** to avoid the standard
PostgreSQL port. If it is occupied, change both Compose and `DATABASE_URL`.
`db:setup` creates the schema and synthetic accounts and applies numbered migrations;
it is repeatable and does not erase submissions. Existing submitted/archived records
are marked **legacy - unverified** because older revisions do not establish reviewer
sign-off. No prior revision is automatically promoted to an approved version.

## Hosted synthetic demo on Render

The explicit hosted-demo path supports a Render-hosted **synthetic-data demo only**;
it does not enable real-data production access or CJIS/HIPAA compliance. Keep
`NODE_ENV=production`. In the Render service's Environment settings, configure
`DEMO_MODE_ENABLED=true` and `DEMO_DATABASE_URL` with the Render PostgreSQL
**internal** connection URL. Do not put database credentials in the Dockerfile,
source control, or image build arguments. Do not set `DEV_AUTH_ENABLED` or use the
local `DATABASE_URL` for the hosted service.

This repository includes a root-level Dockerfile. In Render, use the repository
root as the Docker build context and `Dockerfile` as the Dockerfile path. The
image build runs `npm ci` and `npm run build`; the container starts with the
`npm run start` command, binding Next.js to `0.0.0.0` so Render can route traffic.
Ensure the repository-root `redcap.csv` codebook is committed and included in the
Docker build context because the prototype form reads it at runtime. The Docker
context excludes local environment files, imported intake data, and screenshots.

Configure Render's one-shot **Pre-Deploy Command** as:

```sh
npm run db:setup:demo
```

Set Render's **Health Check Path** to `/api/health`. This endpoint checks that
the app can reach its configured database with a short `SELECT 1` query. It
returns a minimal success response or HTTP 503 without exposing connection
details.

The command requires `NODE_ENV=production`, `DEMO_MODE_ENABLED=true`, and a
non-empty `DEMO_DATABASE_URL`; it always connects using `DEMO_DATABASE_URL` and
never falls back to `DATABASE_URL`. Set the same demo variables on the web service
so the app can connect after deployment. The pre-deploy command applies numbered
migrations and creates the synthetic demo accounts; it does not copy data from
another database. Run `db:setup:demo` as a one-shot deploy step, not on every app
startup. The local `npm run db:setup` remains for non-production development.

The hosted demo login is not real authentication: visitors can choose any demo
role. Restrict access through Render or an approved external access-control layer
if available, and never enter real participant or protected information.

| Account | Scope |
| --- | --- |
| North Program Navigator | Create/read/edit/archive/restore North Intake records |
| North Viewer | Read North records and protected history only |
| North Analyst | Review and approve/return North drafts, but cannot create or edit intakes |
| South Program Navigator | Create/read/edit/archive/restore South Intake records |
| South Analyst | Review and approve/return South drafts, but cannot create or edit intakes |
| Administrator | Read/edit/archive/restore/review across both groups; select a group when creating a Case File |

Program Navigator and Analyst are display names for the existing `editor` and
`reviewer` role codes; permissions remain unchanged. The migration renames only
unchanged default demo account names and preserves customized names and user IDs.

Sessions use random, HTTP-only, SameSite=Strict cookies with hashed tokens in the
database. Idle expiry is 20 minutes; maximum lifetime is 8 hours. The inactivity
clock advances on authenticated requests, not mouse activity or notification polling. Cookie transport
is HTTP only for this loopback demo; production authentication must use HTTPS.
Next.js Server Actions enforce same-origin requests.

## Implemented

- The color theme can follow the device setting or be set to light or dark using
  the device, sun, and moon icons on the sign-in page and in the workspace.
  The preference is stored in this browser, not in the user profile.
- Referral notes are shared with all users who can access the referral, including
  viewers; navigators, analysts, and administrators can add them. They are
  append-only, audited, and independent of phase approval or unsaved form edits.
  There is no limit on the number of notes; each note can contain up to 30,000
  characters. Save a new referral before adding notes, and restore an archived
  or removed referral before adding more. Administrators can browse notes across
  groups under All referral notes. Refresh to see updates made by others.
  **Do not put names, dates of birth, other identifying information, or
  restricted Consent or Case File details in shared notes.** Free text is not
  automatically screened, and every authorized note reader can see its contents.
- Phase 1 Case File is optional and can be saved before or after Consent. It
  records identity, contact and incident information, an optional reviewer note,
  and an optional synthetic JPEG or PNG up to 4 MiB. All fields are optional.
  Only administrators can create or edit Case Files. They save a draft and
  explicitly submit a version to active program navigators in the referral's
  group. Navigators see only submitted versions; analysts and viewers cannot
  access Case Files or photos. Later drafts remain private until resubmitted.
  Existing Case Files are not automatically submitted during migration.
  Saves retain immutable versions and photo access is audited. Basic format
  checks are not malware scanning. Blank photo uploads retain the previous photo.
  Starting with Consent instead is supported, and Case File is not an approval
  prerequisite. Available identity, address and phone fields prefill a new
  Consent form for verification; navigators use only the submitted version and
  existing Consent versions are never overwritten. The view displays the entry
  date (UTC) and optional scheduled appearance date/time (local time).
  Administrators and authorized navigators can download an audited synthetic
  PDF of the version they are viewing, including the photo. The export fails
  explicitly if a photo or characters cannot be rendered, rather than omitting
  them. Reload if a newer visible version has replaced the one shown.
- Administrators manage synthetic navigator profiles, group membership, active
  status and optional email and phone under Navigator profiles. Submission
  creates an in-app notification per active navigator in the same group.
  The bell refreshes periodically without extending session expiry; viewing the
  Case File clears that user's applicable notifications, retaining their read
  records. Email and SMS are **disabled**; nothing is sent, and missing contacts
  are reported. Live delivery, verified contacts, provider retries, real
  authentication and agency security approval remain unimplemented.
- Referral phase 2 is Consent: required first and last names, date of birth,
  address, phone, email, sharing confirmation and signed-document confirmation;
  middle name and emergency contact information are optional. A synthetic PDF
  is optional, up to 4 MiB. PDF checks are basic format checks, not malware
  scanning or signature verification. A correction creates a new immutable
  version; earlier values and PDFs are visible only to the original Consent
  submitter and administrators. Corrections require editing permission as well.
  Downloads are audited. A version without a PDF does not copy an earlier PDF.
- Staff checkboxes are attestations only; the app does not verify a signature
  or establish legal consent. Consent withdrawal and invalidation are not
  implemented, so this workflow must not be used for real participants.
- Consent unlocks phase 3 Intake. Historical and imported records remain
  consent-unverified until a new consent version is submitted. Their original
  answers and approved snapshots are retained; corrections do not invalidate
  earlier Intake approvals. Name searches match the latest Consent only when
  the searcher is the original Consent submitter or an administrator; DOB
  search and sorting by name or DOB are unavailable.
  Consent is required for Intake changes, review and new REDCap prototypes.
  Each Consent version can include an optional note for the reviewer.
- Phase 4 Screening and Services unlocks after current Intake approval. It
  includes the screenshot-based screenings, disorder identification, diagnosis,
  referral, ASAM date/location, and service-by-service referral/outcome/reason
  fields. ASAM location is free text. Service statuses are validated against
  contradictions, controlled options are server-validated, and every saved
  revision is audited and retained. Program navigators can save and request review;
  eligible analysts or administrators approve or return with a reason, using separation of duties.
  Participant identity is not asked again. Because the source packet marks no
  Screening question as required, it allows blank answers and leaves completeness
  to staff review; the service matrix is explicitly optional where not referred.
- Phase 5 Program Completion unlocks after current Intake and Screening and
  Services approval. It records completion or alumni status, exit dates,
  reasons and outcomes, justice and charge disposition, housing, employment,
  health and other information from the supplied completion form. Participant
  identity is not collected again. Draft answers may remain blank; staff review
  completeness. Program navigators request review of a saved draft, and an
  eligible analyst or administrator approves or returns it; revisions and approved snapshots are retained.
  Phase approval means the form was reviewed, not that the participant
  completed the program. Consent and all three later phases include optional
  reviewer notes retained in their respective versions. Real reporting
  definitions and reports based on these records remain unimplemented.
- **REDCap data preparation** creates a synthetic JSON prototype, available to analysts and
  administrators for an active, currently approved Intake. It uses only an
  immutable, currently approved Intake, Screening and Services, and Program
  Completion snapshots for prefill. Source versions are recorded with each
  prototype, and changes require the form to be reloaded. Identity fields are excluded and
  ambiguous choices require manual entry. Additional answers are not separately reviewed or approved.
  The participant UUID is used as the record ID; UUID compatibility, REDCap's
  ID assignment and import behavior have not been verified for the target project.
  The included `../redcap.csv` is a codebook, not an import
  specification. Conditional questions are all displayed for manual review;
  branching logic, field completeness, JSON structure and REDCap compatibility
  are not verified. Do not upload prototype files to REDCap. No network request
  is sent to REDCap. The application stores each generated file, audits creation,
  download, removal and restoration, and retains removed content. A legal hold
  prevents removal. Previously generated files remain available to authorized
  analysts and administrators if the Intake is later edited or archived,
  except older prototypes containing restricted identity fields cannot be downloaded.
  A real project-specific import specification and security approval are
  required before any operational use.
- A post-login dashboard with workspace shortcuts and a group-scoped synthetic
  report demonstration for all roles. Non-administrators see only their group;
  administrators can see all groups as separate reports or select one group.
  Fixed fictional examples are entirely separate
  from stored Intake records and approved snapshots. Date filters use the
  illustrative event dates explained on the dashboard. **Never use demo figures
  to evaluate programs, plan budgets, or request grants.** There is no report
  export or external submission. Real reporting remains deferred pending client
  decisions; see the [dashboard and report plan](./docs/report-generation-plan.md).
  Each breakdown offers a list, table, and suitable chart views. Pie charts are
  enabled only for explicitly defined, nonempty mutually exclusive wholes with
  matching totals (currently the demo program and first-contact categories).
  Other categories remain bar/list/table only until their real semantics are
  approved. This chart selection is illustrative, not validation of real metrics.
- Screenshot-based Intake questions across five responsive sections and review;
  identity, contact and participant attestation-name fields were moved out of
  the Intake editor, while historical snapshots preserve their original values.
  Intake has an optional, versioned note for the reviewer.
- An always-visible per-question and per-step completion checklist for unanswered
  questions, including conditional and "Other" answers.
- Every create or edit saves as a draft. Program navigators request review of a saved draft
  only after answering all applicable questions. An analyst or administrator in
  scope can approve that exact revision or return it with a required reason.
- The form library and referral header show the current phase and its state,
  considering prerequisite locks. The phase list shows each phase separately.
  The Awaiting review filter includes accessible pending reviews across all
  three reviewed phases. Refresh to see changes made by other users.
- Approved Intake, Screening and Services, and Program Completion phases are
  read-only until a program navigator or administrator explicitly chooses to correct them. Saving an Intake
  or Screening correction creates a draft and locks later phases until that
  phase is reapproved. Later records and approvals are retained and become
  available again without another review. Correcting Consent submits a new
  version immediately; Consent has no separate review step and does not change
  later approvals.
- Analysts cannot edit intakes. Analysts and administrators cannot approve or
  return a draft they edited or submitted for review. All contributors since the
  preceding approval are considered, not just the latest editor.
- Approval stores a separate immutable full-answer snapshot with the template
  version, draft revision, contributors, requester, reviewer, and timestamps.
  Later edits return the working record to draft without changing prior approvals.
  The detail page compares working answers with the last approved version.
- A review request is invalidated if the draft is saved again. Revision checks and
  row locking reject stale approvals and concurrent overwrites; approval, decision,
  audit and snapshot commit together.
- Intake approval is not participant electronic signature or completion of the
  participant's program. Report generation and effective-date tracking remain
  future work.
- Conditional disqualification and Other inputs, date/option/phone validation.
- Server-side group authorization for queries, counts, writes, and history.
- PostgreSQL persistence, participant/enrollment references, and template version.
- Each new referral has a distinct participant UUID, displayed after Consent
  submission instead of the person's name. Existing no-consent drafts show the
  referral ID. Repeat referrals are not yet linked to an existing participant.
  Search by participant ID, enrollment ID, or an authorized consent name;
  status/program/navigator/date filters are also available.
- Referral details and phase forms have expandable section headings. History
  and approved-version sections start collapsed; active work starts open.
  Collapsing a form section keeps its answers for saving.
- Allowlisted sorting and 20-record server pagination.
- Transactional edit/archive/restore operations with optimistic revisions and
  row locks. Stale edits cannot overwrite newer changes.
- Append-only security audit events and immutable answer snapshots. Updates,
  snapshots, and audit events commit or roll back together.
- Record history displays the latest 100 audit events and 20 saved versions.
- Archiving removes a submitted form from the default active list without deletion.
  It does **not** mark an enrollment as completed or perform sealing/expungement.
- No-store responses, anti-framing headers, no analytics, and explicit development
  warnings. Error notifications omit submitted answers.
- Administrators can preview and import synthetic CSV/TSV files matching the
  supplied 25-column template into a selected group. Valid rows are saved as
  drafts; malformed-width or oversized-field records are skipped and reported.
  Malformed quoting rejects the file. The file is limited to 4 MiB and 10,000
  data records. All original columns are retained with each record but are no
  longer displayed in the referral view; this is not approved storage for
  actual CJI or health data.
- Only valid, unambiguous DOBs are mapped automatically. Missing or ambiguous
  DOBs and all names use clearly labeled generated placeholders; they must be
  replaced through Consent before review. Other source fields
  are preserved but not interpreted as Intake answers. Exact-file SHA-256
  duplicate detection blocks retrying the same bytes while any earlier batch
  has active records. Once all earlier records are removed, an administrator
  may explicitly confirm re-import. This does not detect duplicate people or
  rows in modified files. Correct skipped records in a new file before retrying;
  do not re-import rows already saved.
- Import history lets administrators preview and undo only untouched imported
  drafts, excluding changed, reviewed, submitted, legally held, or already
  removed records. An administrator can mark an individual unapproved imported
  draft without a legal hold as a duplicate of an active intake; identify the
  existing intake by its ID on its detail page. No automatic matching or merging
  occurs. Both actions require a reason and confirmation. Removed drafts are
  hidden from normal searches and can be found using the administrator-only
  Removed imports filter. Administrators may restore them individually, except
  while another batch of the same file has active records.
- Import removal is reversible, not deletion. Source data, revisions, the linked
  duplicate, actor, reason, and timestamps remain in the database with
  append-only removal history and audit events. Policies for permanent deletion,
  retention, legal holds, and regulated data require agency approval.

Each new referral creates a new participant and enrollment. Linking an additional
enrollment to an existing participant and duplicate review are future work; name
matching is deliberately not used to merge people.

## Provisional packet decisions

The paper form uses checkboxes for many questions without indicating cardinality.
Program type and yes/no questions are single-select in this pilot; other checkbox
groups are multi-select. None/unknown/prefer-not-to-answer/uninsured cannot be
combined with other choices. Agency review must confirm these choices.

The visual completion checklist flags all visible unanswered questions independently
of draft-save validation; unanswered fields can still be saved as a draft.
Some long option labels are abbreviated for readability. The combined
"Native Hawaiian or Pacific Islander or Asian" and "HIS" choices preserve the
source wording pending agency clarification.

The former Intake attestation-name field is retained only in historical answers.
The Consent checkbox does not create or verify a legally approved signature.
Select and approve the signature/document workflow before collecting legally
operative forms.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
npm test
TEST_DATABASE_ADMIN_URL=postgresql://deflection_dev:synthetic_data_only@127.0.0.1:55439/deflection_dev npm test
```

Without `TEST_DATABASE_ADMIN_URL`, database tests are explicitly skipped. With it,
tests create a uniquely named temporary database on the specified local server,
apply the schema, verify real persistence/authorization/concurrency/audit behavior,
and drop only that database afterward. The account must have database-creation
permission. Do not target a production server.

Browser verification covered login, draft save, mobile layout, archiving,
read-only routes, cross-group denial, live unanswered counts, review request,
reviewer approval, and preservation of the prior approved version during editing.
One synthetic browser-validation record may be present in the North archive.

## Remaining milestones and production gates

- The other four packet forms, service tracking, and consent expiration/revocation.
- Existing-participant enrollment workflows and group/form-specific permission grants.
- Approved electronic signing or signed-document attachment and version preservation.
- User/group administration, MFA/SSO, access reviews, and privileged-access procedures.
- Retention policies, legal holds, authorized disposal, and backup handling.
- Agency CJIS control mapping plus assessment of HIPAA, 42 CFR Part 2, and Oregon law.
- Hosting/vendor/personnel approval, encryption/key management, incident response,
  vulnerability management, backup restoration, security-log review and retention.
- Access-purpose and disclosure rules for clinical information; group membership
  alone does not establish authorization to disclose health information.
- Accessibility audit against WCAG 2.2 AA and approved mobile-device policy.

This milestone uses parameterized SQL via `pg`, rather than Prisma, to keep the
small transactional workflow and executable schema transparent. Zod validates
all answers; indexed relational columns cover search/sort fields, with JSONB for
the versioned answer document. Native controlled React inputs and Server Actions
avoid a second client-validation implementation; Tailwind and Lucide provide the
initial visual system without introducing a component-library setup.

## Stop local services

Stop the foreground Next.js process with Ctrl+C. Stop this project's database with:

```sh
docker compose stop db
```

The named Docker volume preserves synthetic records across database restarts.
