# Deflection Intake Workspace

A Next.js and PostgreSQL web application prototype for deflection-program intake
workflows, review, and synthetic reporting.

> **Synthetic data only.** This hosted demo is not approved for real participant,
> criminal justice, legal, health, or substance-use information. It is not CJIS
> or HIPAA compliant or certified. The demo login lets any visitor select any
> role, including administrator. Restrict access to the Render service and use
> only fabricated data, including uploaded PDFs.

The demo supports Consent (with an optional PDF), Intake and review, and
Screening and Services after Intake approval. Program Completion remains a
placeholder awaiting its questions and workflow, so the app cannot yet track a
referral through program completion. Consent withdrawal is not implemented.

## Deploy a synthetic demo to Render

This repository includes a Dockerfile at the repository root. Create a Render
PostgreSQL database and a Docker-based web service connected to this repository.
Configure the web service to use:

- **Root Directory / Docker build context:** repository root
- **Dockerfile path:** `Dockerfile`
- **Pre-Deploy Command:** `npm run db:setup:demo`
- **Health Check Path:** `/api/health`
- **Environment variables** in Render's Environment settings:
  - `DEMO_MODE_ENABLED=true`
  - `DEMO_DATABASE_URL`: the Render PostgreSQL **Internal Database URL**

Keep `NODE_ENV=production` (Render sets it for the Docker image). Do not set
`DEV_AUTH_ENABLED` on the hosted service. The app and the one-shot database setup
command require the explicit demo flag and dedicated `DEMO_DATABASE_URL` in
production; they do not fall back to `DATABASE_URL`. Do not put database
credentials in the Dockerfile, repository, or image build arguments.

The pre-deploy command creates or updates the schema and synthetic demo accounts
by applying the numbered SQL migrations. It does **not** copy data from another
database. Run it as a deploy step, not when each app container starts. For a
first deployment, Render's PostgreSQL database should be empty or dedicated to
this demo.

The Docker build expects the repository-root `redcap.csv` codebook and includes
it in the image. Keep the codebook in the repository if the REDCap prototype
screen is needed. The `.dockerignore` excludes local environment files, the
synthetic import CSV, and screenshots.

### Deploy with the Render dashboard

1. Push this repository to GitHub. Create a Render PostgreSQL instance and a
   Docker web service for the repository.
2. Set the Docker build context to the repository root and the Dockerfile path
   to `Dockerfile`.
3. Add `DEMO_MODE_ENABLED=true` and `DEMO_DATABASE_URL` in the web service's
   Environment settings. Use the database's internal URL when the services are
   in the same Render region.
4. Set the web service's Pre-Deploy Command to `npm run db:setup:demo`.
5. Set the web service's Health Check Path to `/api/health`.
6. Deploy and verify the app using synthetic records only.

The health endpoint performs a short database readiness query and returns only
`{"status":"ok"}` on success. If the configured database cannot be reached, it
returns HTTP 503 with a support incident ID; connection strings and database
errors are not returned to the caller.

Render's available service-access controls should be used to limit who can reach
the demo. The in-app account selector is only a development convenience, not
authentication. Anyone who can reach it can choose any role.

## Local development

See the detailed [application README](web/README.md) for local prerequisites,
Docker Compose database setup, development login accounts, implemented
workflows, and tests. The local setup command is:

```sh
cd web
npm install
cp .env.example .env.local
docker compose up -d --wait db
npm run db:setup
npm run dev -- --port 3100
```

`npm run db:setup` is for non-production local development. It is not the Render
pre-deploy command.

## Data migration and backups

The Render demo setup command only migrates the schema; it does not transfer
existing database records. For backup, restore, moving data between databases,
schema-change practices, and recovery planning, see the
[database backup and migration runbook](web/docs/database-backup-and-migration-plan.md).
Keep any database dump out of Git and transfer it only through an approved,
protected process. Use synthetic data only in this demo.

## Security and production status

This is a prototype, not a production-ready case-management service. The hosted
demo uses selectable, passwordless demo identities and does not provide
enterprise SSO/MFA or establish user identity. Do not use it to store or process
real CJIS, HIPAA-regulated, or other protected data. Real-data deployment requires
separate agency authorization, approved identity and hosting, security controls,
privacy/legal review, and a production migration and recovery process.

See the [application safety notes and feature documentation](web/README.md),
[authentication plan](web/docs/login-and-authentication-plan.md), and
[database backup and migration plan](web/docs/database-backup-and-migration-plan.md).
