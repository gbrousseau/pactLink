# Deflection Intake Pilot

Next.js App Router, TypeScript, Tailwind CSS, Zod, and PostgreSQL development application.
The Intake form is mapped from `../forms_screenshots-06.png` through
`../forms_screenshots-08.png` (packet version 09.24.2026).

## Safety boundary

**Use synthetic data only. This is not a CJIS-approved or production-ready system.**

All database operations and demo login require `DEV_AUTH_ENABLED=true` and refuse
`NODE_ENV=production`. A production build is supported for compile verification,
but `next start` intentionally exposes only the blocked login screen.
Do not remove that guard to deploy real legal, CJI, health, or substance-use records.

The checked-in database password is a public, local-demo value, not a production
credential. PostgreSQL listens on loopback only. Demo accounts do not use passwords
or MFA. Anyone able to access the demo login can select any demo role. Application
group isolation therefore demonstrates authorization behavior, not secure identity.
The Docker database uses an owner account; its immutable-history triggers do not
protect against infrastructure owners. Encryption, validated cryptographic modules,
independent security logging, least-privilege database accounts, agency approval,
personnel obligations, and an approved identity provider are still required.

Deferred planning documents:

- [Login and authentication plan](./docs/login-and-authentication-plan.md)
- [Report generation plan](./docs/report-generation-plan.md)
- [Administration, API settings, and profile plan](./docs/administration-and-profiles-plan.md)

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
`db:setup` creates the schema and four synthetic accounts; it is repeatable and
does not erase submissions. Schema changes for subsequent milestones should use
numbered migrations rather than relying on `CREATE TABLE IF NOT EXISTS` to modify
existing tables.

| Account | Scope |
| --- | --- |
| North Editor | Create/read/edit/archive/restore North Intake records |
| North Viewer | Read North records and protected history only |
| South Editor | Create/read/edit/archive/restore South Intake records |
| Administrator | Read/edit/archive/restore across both groups; creates in North |

Sessions use random, HTTP-only, SameSite=Strict cookies with hashed tokens in the
database. Idle expiry is 20 minutes; maximum lifetime is 8 hours. The inactivity
clock advances on authenticated requests, not mouse activity. Cookie transport
is HTTP only for this loopback demo; production authentication must use HTTPS.
Next.js Server Actions enforce same-origin requests.

## Implemented

- 34 screenshot-based Intake questions across five responsive sections and review.
- An always-visible per-question and per-step completion checklist for unanswered
  questions, including conditional and "Other" answers.
- Every create or edit saves as a draft. No completion or submit action is available;
  saving changes an existing submitted record back to draft.
- Conditional disqualification and Other inputs, date/option/phone validation.
- Server-side group authorization for queries, counts, writes, and history.
- PostgreSQL persistence, participant/enrollment references, and template version.
- Search by participant name or enrollment ID; status/program/navigator/date filters.
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

Each new Intake creates a new participant and enrollment. Linking an additional
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

The participant-signature line is represented by an explicitly **non-signing**
attestation-name field. This does not constitute a legally approved signed intake.
No signed record is generated. Select and approve the signature/document workflow
before collecting legally operative forms.

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
read-only routes, cross-group denial, live unanswered counts, section/question
indicators, and the draft-only save action.
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
