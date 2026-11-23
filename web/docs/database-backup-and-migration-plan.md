# Database backup, migration, and recovery plan

## Status and safety boundary

This is an operational plan for the current PostgreSQL-backed synthetic-data
prototype. It is not evidence that the application is ready for production,
CJIS, HIPAA, 42 CFR Part 2, or other protected information. Do not copy real
participant, legal, criminal justice, or health information into the current
development database or its backups.

The destination platform, hosting provider, data classification, retention
period, recovery point objective (RPO), and recovery time objective (RTO) have
not been selected. The County security, privacy, records-management, database,
and application owners must approve those items before production migration.
Backup frequency and retention must be derived from approved RPO/RTO and records
requirements, not chosen by this prototype.

## Current state and important limitations

- PostgreSQL runs in local Compose and binds to loopback. The named Docker volume
  survives a container restart, but it is **not a backup** and does not protect
  against disk loss, accidental volume deletion, corruption, or ransomware.
- `npm run db:setup` and `scripts/setup-db.mjs` default to non-production local
  development and require `DEV_AUTH_ENABLED=true`. The explicit
  `npm run db:setup:demo` mode is allowed only with `NODE_ENV=production`,
  `DEMO_MODE_ENABLED=true`, and `DEMO_DATABASE_URL`; it targets a hosted
  synthetic demo database only. Neither mode is a real-data production migration
  mechanism.
- The setup script applies `001-initial.sql` and then migrations
  `002-review-workflow.sql` through `005-redcap-prototype.sql`. It creates a
  `schema_migrations` journal for migrations 002 onward; migration 001 is the
  initial baseline, not a journaled migration. Preserve this distinction when
  designing a production migration runner.
- The app uses database-owner credentials in the local demo. Production must
  use separately managed migration and application identities with
  least-privilege grants; neither the local `.env.local` nor Compose credentials
  may be copied to the destination.
- The database contains records, revisions, approvals, audit events, imported
  source data, and generated prototype payloads. Treat the whole database and
  every backup as sensitive, even while the current permitted data is synthetic.
- A `pg_dump` of this database does not include app source, uploaded inputs
  stored outside PostgreSQL, environment configuration, secret keys, identity
  provider settings, or deployment infrastructure. Inventory and back up those
  separately if a future approved system depends on them.

## Decisions required before a real move

Record and approve:

1. Hosting provider, region, environment boundaries, network design, and
   database service/version.
2. Whether the transferred dataset is synthetic or contains regulated data;
   data owner, classification, privacy/security authorization, applicable
   CJIS controls, HIPAA/BAA determinations, and any 42 CFR Part 2/Oregon-law
   obligations.
3. RPO, RTO, backup frequency, retention, archival, legal hold, and disposal
   requirements, including treatment of old backups after deletion requests.
4. Encryption at rest and in transit, approved cryptographic modules where
   required, key custody/rotation, backup encryption, and who can restore.
5. Accountable operators, two-person approval for production restore or
   destructive schema changes, maintenance window, outage communication, and
   rollback decision owner.
6. External audit-log forwarding, log review and retention, restore testing,
   incident response, and vendor/agency approvals.

If these are not decided, limit the procedure below to a synthetic test copy.

## Backup policy and runbook

### Policy

- Use provider-managed automated backups and point-in-time recovery only after
  the service, region, encryption, key management, retention, and restore
  behavior have been approved.
- Maintain a separate logical backup (`pg_dump` custom format) before every
  database migration and before a planned move. A logical dump supplements
  service backups; it does not replace them.
- Store backup artifacts only in an access-controlled, approved location
  separate from the database host and source repository. Encrypt before transfer
  and storage using the organization's approved process. Keep encryption keys
  separate from backup artifacts and restrict restore access.
- Never put dumps, exports, credentials, or key material in Git, a developer
  home directory shared with others, issue/chat attachments, or unapproved
  cloud storage. Use a protected temporary directory and remove temporary
  plaintext only after a verified encrypted copy exists, under the approved
  media-disposal process.
- Define and automate backup success/failure alerting, retention expiry, access
  review, and periodic restore drills. A backup that has not been restored and
  checked is not a proven recovery path.
- Include database backups, WAL/PITR, exports, and any external files in the
  same retention and legal-hold policy. Understand that a logical restore can
  restore records that the application has marked as removed.

### Synthetic development backup example

Run from the web project with the local database available. This creates a
PostgreSQL custom-format dump; the resulting file is **not encrypted** by this
command and must not be moved or retained outside the protected local synthetic
environment until encrypted using an approved method.

```sh
umask 077
mkdir -m 700 -p "$HOME/deflection-backups"
backup_file="$HOME/deflection-backups/deflection-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl \
  --file="$backup_file" \
  "$DATABASE_URL"
pg_restore --list "$backup_file" >/dev/null
sha256sum "$backup_file"
```

Set `DATABASE_URL` through a protected local environment, not by pasting
credentials into a command, terminal transcript, or ticket. Replace the
`$HOME/deflection-backups` path if home storage is shared or is not approved.
Keep database dumps out of the repository. Do not use a backup directory inside
the repository tree.

For managed services, use the provider's approved backup/PITR mechanism and
record the backup identifier, database version, timestamp, encryption/key
reference, and verification result in the authorized operations log. Do not
copy database credentials or participant data into that log.

## Restore and recovery runbook

Restore into a **new, isolated, empty database** first. Never test a restore by
overwriting the source or a live target.

1. Declare the incident/change and obtain operator approval. Determine whether
   recovery is required and select a backup/PITR timestamp consistent with the
   approved RPO and retention policy.
2. Provision an isolated target using the approved PostgreSQL version, network
   restrictions, encryption and key configuration, and separate migration/app
   roles. Restore the backup only through an authorized operator.
3. Verify the artifact checksum and decrypt it only in an approved protected
   environment. Inspect its contents before restore using `pg_restore --list`.
4. Restore to a new empty database, for example:

   ```sh
   pg_restore --exit-on-error --no-owner --no-acl \
     --dbname="$TARGET_DATABASE_URL" \
     "$PROTECTED_BACKUP_FILE"
   ```

   `$TARGET_DATABASE_URL` and `$PROTECTED_BACKUP_FILE` are placeholders. Obtain
   values from the approved secret store and protected backup location; do not
   put credentials in the command text or shell history. Use the organization's
   managed restore process instead where required.
5. Run schema and data checks without exposing record contents: expected table
   names, migration journal state, row counts, foreign-key checks, application
   startup/readiness, group authorization, and read-only workflow smoke tests.
   Compare counts against approved backup metadata, not by printing sensitive
   records.
6. Apply any approved pending migrations to this restored copy using the
   production migration runner described below. Do not run `npm run db:setup`.
7. Have the application owner and data owner approve the restored state. Keep
   the original source intact until the destination passes validation and the
   rollback window closes.
8. If cutover is approved, restrict writes on the old system, take a final
   backup or synchronize changes using an approved method, verify the destination
   again, switch the approved connection/traffic configuration, and monitor
   health and audit events. Do not run both systems writable unless a tested
   conflict/reconciliation design exists.
9. If validation or cutover fails, stop writes to the destination, restore
   traffic/configuration to the old system, preserve logs and failed artifacts
   for investigation, and document the reason. Do not discard either copy until
   the data owner authorizes disposition.
10. After the approved rollback period, remove temporary copies and old-system
    data only under the retention/legal-hold policy, including backup copies.

## Moving to another host

For an initial move, use a planned maintenance window rather than an untested
live replication design:

1. Provision the approved application and PostgreSQL environments separately;
   lock down ingress/egress, TLS, encryption, monitoring, managed secrets,
   backups/PITR, identity, and least-privilege roles.
2. Build and verify the exact app commit and dependency lockfile intended for
   deployment. Do not enable the development login or remove the production
   guard to make the app appear operational.
3. Deploy the application to a staging environment with a fresh database.
   Apply an explicitly reviewed baseline and migration sequence using a
   production-safe migration runner. Test migrations and rollback/forward-fix
   behavior using a recent synthetic copy.
4. Take and verify a source backup. Freeze source writes, take a final dump,
   encrypt/transfer through the approved path, verify its checksum, and restore
   into the isolated destination.
5. Apply only migrations that are not already represented in the restored
   schema journal. Confirm data counts, relationships, approvals, revisions,
   audit rows, and export records. Verify that migration did not fabricate
   approvals or change immutable snapshots.
6. Perform access-control and workflow tests with approved test identities;
   no demo identities or synthetic role selector may be enabled for real data.
7. Obtain security, privacy, application, database, and data-owner sign-off
   before controlled cutover. Monitor logs and service health; retain the
   old source under the approved rollback/retention plan.

Do not treat this local Docker Compose setup as a hosting design or a secure
production deployment.

## Database schema change policy

1. Every schema change gets a new, sequentially named SQL migration in `db/`,
   e.g. `006-descriptive-change.sql`. Never edit an already applied migration
   to change the schema on existing databases.
2. Review migration SQL for data loss, lock duration, table rewrites, index
   build behavior, foreign-key validation, trigger behavior, sensitive-data
   retention, legal holds, and audit implications. Define a data backfill and
   rollback/forward-fix plan where applicable.
3. Prefer expand/contract changes: add compatible nullable columns/tables,
   deploy code that can read old and new representations, backfill in bounded
   batches, validate, switch reads/writes, then remove old schema only in a
   separately approved later migration. Avoid long blocking transactions on
   large production tables.
4. Keep each migration deterministic and safe to apply once. The migration
   runner should acquire a database advisory lock, use a dedicated migration
   identity, record name/checksum/applied timestamp/operator or deployment,
   fail on mismatch, and stop on the first error. Do not silently skip failed
   migrations.
5. Test against a fresh database **and** a copy upgraded from the previous
   release. Verify data invariants, application compatibility, authorization,
   audit events, backup restore, and the intended threshold/shape of transformed
   data before production.
6. For transactional DDL, wrap the migration and journal insert in one
   transaction. For operations PostgreSQL cannot run transactionally (for
   example concurrent index creation), use an explicit, reviewed migration
   procedure and record partial progress safely.
7. Take a verified pre-change backup, use a maintenance window when needed,
   monitor locks/errors/latency, and have a named operator decide go/no-go.
   Prefer a forward-fix for production data transformations; restoring a backup
   may discard writes made after that backup.
8. A destructive change (drop/truncate, lossy conversion, purge, or altered
   retention) requires explicit data-owner approval, legal-hold review,
   independent backup verification, and a tested recovery/disposal procedure.

## Migration runner work required before production

The current `scripts/setup-db.mjs` is deliberately development-only and invokes
the initial schema plus numbered migrations. Before any hosted production
deployment, implement and review a distinct production migration mechanism
that:

- does not require `DEV_AUTH_ENABLED` and does not expose demo login;
- runs as a one-shot release/deployment job, not on application startup;
- uses a migration-only database role, separate from the app's runtime role;
- checks the expected baseline and migration journal, serializes concurrent
  deploys, and records checksums and operator/deployment identity;
- applies only reviewed migrations, validates postconditions, and fails closed;
- does not restore data, create demo users, drop/recreate schemas, or invoke the
  development setup script;
- is tested in staging with a restored backup and has an approved recovery plan.

Do not implement that runner by weakening the production guard in
`scripts/setup-db.mjs`; keep the development setup and production migration
paths separate.

## Recovery exercise record

Before production and at an approved recurring interval, conduct a restore
exercise in an isolated environment. Record only operational metadata:

- exercise date, environment, database engine/version, backup identifier;
- restore start/end and measured recovery time;
- point-in-time/data-loss estimate and measured recovery point;
- migration version before/after, validation checks and pass/fail;
- operator and approver identities, issues, corrective actions, and due dates.

Do not include credentials, keys, or participant records in the exercise record.
The system owner must approve and publish target RPO/RTO and the exercise
frequency.
