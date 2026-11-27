# Administration, Integration Settings, and User Profiles Plan

**Status:** Deferred — requirements discovery and design only.  
**Implementation:** Not started. Do not store production users, API credentials, or
real profile images in the prototype.

This plan describes a future administration and profile-management area for the
Deflection Workspace. It preserves the current group-scoped viewer, program navigator,
analyst, and administrator
application model while recognizing that production identity and authorization
must integrate with the organization-approved identity provider and CJIS/HIPAA
controls. See the [login and authentication plan](./login-and-authentication-plan.md)
before implementing account lifecycle or privileged settings.

## 1. Goals and boundaries

- Allow authorized administrators to provision/invite users, assign groups, set
  application-level permissions, deactivate/revoke access, and review changes.
- Allow users to view and update approved profile fields and manage an optional
  avatar.
- Provide a controlled place to configure future third-party API endpoints and
  credentials without exposing secrets or sending data unexpectedly.
- Audit privileged changes and make configuration changes reviewable and reversible.
- Keep identity-provider authentication, external API credentials, and end-user
  profile data as separate concerns.

These features do not make the prototype or future service CJIS/HIPAA compliant.
Production implementation requires the agency and Privacy/Security Officers to
approve requirements, hosting, identity, data flow, secrets handling, retention,
and operational controls. Use synthetic data only until all applicable approvals
are complete.

## 2. Administrator information architecture

Add a server-authorized **Administration** area visible only to users with explicit
admin grants. Suggested sections:

1. **Users and access** — invitations/provisioning, status, group memberships,
   form-type grants, last access, and access review.
2. **Organization settings** — approved non-secret workflow and display settings,
   report configuration, and API connection metadata.
3. **API integrations** — endpoint configuration, credential rotation/status,
   connection testing, and future delivery history.
4. **Audit and security activity** — who changed users/settings, when, previous/new
   non-secret values, and outcomes; access to sensitive logs remains separately
   permissioned.

The interface should be responsive and usable on desktop/tablet/mobile. Administrative
actions should require confirmation, display the affected scope, and report errors
explicitly. Do not place API keys or secrets in a settings page where they can be
revealed again.

## 3. User lifecycle and permissions

### Provisioning

- Prefer invitation, directory sync, or approved IdP group/SCIM provisioning over
  locally managed passwords. Production identity authentication follows the
  [login and authentication plan](./login-and-authentication-plan.md).
- Associate the account with the IdP's stable subject identifier. Do not use
  changeable email address as the sole long-term identity key.
- Verify the person using the agency-approved process before granting access.
- Require the relevant sponsor/manager to request access; capture approver,
  timestamp, reason, and expiration or review date if applicable.
- Create an invitation with a short expiry; do not email a password or MFA secret.
- Do not allow self-registration into an organization or privileged role.

### Grants

Keep separate:

- **Authentication and personnel eligibility:** owned by the IdP and agency
  processes, not a local application role.
- **Organization/group membership:** which team or data boundary the user belongs to.
- **Form-type/action grants:** view, create, edit, complete, archive, export, or
  administer, as those workflows are approved.
- **Privileged application administration:** user, grant, and settings management.

Use deny-by-default authorization on every server operation. Avoid deriving
administrator access solely from a user-controlled request or arbitrary identity
claim. Where agency policy calls for separation of duties, require distinct
approvers for user provisioning, administrator assignment, production configuration,
and external API credential changes.

### Account status and reviews

Support explicit states such as invited, active, suspended, and deactivated. Show
the current authorization source and make account ownership clear. On suspension,
deactivation, role/group removal, or IdP disablement:

- Revoke application sessions promptly.
- Deny new access and re-check permissions on every protected request.
- Preserve required audit history.
- Do not delete records the user created or alter their attribution.
- Review outstanding integrations, exports, and privileged actions.

Provide periodic access recertification for supervisors/system owners, documenting
decisions and completion. Record the last review and flag overdue reviews.
Administrators should not silently grant access to data outside their approved
scope merely by adding a user.

## 4. Administrator-controlled organization settings

Separate settings into clear classes:

### Non-secret application settings

Examples might include approved display names, organization contact details,
report footnotes or templates, default workflow behavior, feature enablement, and
retention-policy identifiers. For each setting, define:

- Who may view and change it.
- Whether a change needs a second-person approval.
- Validation, effective time, and rollback behavior.
- Audit fields and whether the value is tenant-specific or global.
- Whether existing records or only future records are affected.

### Security-critical settings

Authentication policy, production identity-provider configuration, session policy,
group mappings, allowed domains/issuers, retention, audit routing, network settings,
and cryptographic/key settings should not be casually editable by a general
application administrator. Establish an agency-controlled deployment/change
process, approvals, configuration review, rollback, and break-glass safeguards.
Store sensitive infrastructure configuration in approved deployment/secret
management systems where appropriate.

## 5. Third-party API URL and credential settings

An API URL and API key are security-sensitive integration configuration, not
ordinary profile/settings fields.

### URL / endpoint controls

- Separate test/sandbox and production environments; display the active environment
  prominently.
- Require an approved HTTPS URL. Reject cleartext HTTP, embedded credentials,
  unexpected schemes, unapproved hostnames, localhost/private/link-local/metadata
  addresses, and unsafe redirects unless an explicitly reviewed internal integration
  requires them.
- Maintain an administrator-approved hostname/endpoint allowlist. Resolve and
  validate DNS/network destinations at connection time as well as configuration
  time to reduce server-side request forgery risk.
- Do not let a user-supplied URL create an unrestricted server-side fetch or proxy.
- If endpoints can change dynamically, require approval, audit the old/new endpoint
  without including credentials, test TLS, and consider dual approval for production.

### Credential handling

- Use the provider's recommended modern authentication (for example, short-lived
  OAuth client credentials or workload identity) when available rather than a
  static API key.
- Keep credentials in an approved managed secrets vault, never in the browser,
  URL, query string, form submission, source code, database plaintext, logs,
  analytics, report exports, or audit before/after values.
- Apply least-privilege scopes, separate credentials per environment, and assign
  an accountable owner and rotation/revocation date.
- Show only a masked fingerprint/prefix and last-rotated date. A saved secret
  cannot be retrieved or revealed in the UI.
- Provide an explicit replace/rotate action. Do not clear the active secret until
  the replacement is stored and validated. Preserve rollback through a managed,
  time-limited previous version only if policy permits.
- Restrict secret creation/access to a small privileged group and log access or
  rotation events without the secret itself.
- Define expiry alerts, rotation cadence, revocation on compromise, and incident
  response with the API owner.

### Connection test and future delivery workflow

- A connection test should make a safe, documented, non-data request to a fixed
  provider health/capability endpoint; do not submit participant data to “test”
  connectivity.
- Limit response size and time; validate redirects and TLS; prevent returned error
  text from leaking secrets.
- Record tester, timestamp, environment, endpoint identifier, and sanitized outcome.
- Later record actual outbound submissions separately, with idempotency, exact
  payload-version mapping, consent/authorization checks, acknowledgments, retries,
  delivery status, and a protected audit trail.
- API submission must be an explicit, separately authorized workflow; generating
  reports or saving forms must not automatically transmit data.

Obtain the third party's schema, endpoint allowlist, authentication requirements,
scope, sandbox, data-processing terms, logging, rate limits, retries, error model,
retention, and incident-notification commitments before implementing integration.
Review the full data flow under CJIS, HIPAA/BAA, 42 CFR Part 2, state rules, and
agency agreements as applicable.

## 6. User profile and avatar

### Editable profile fields

Start with the minimum fields needed for safe operation, such as preferred display
name, work contact details if approved, and an optional avatar. The identity
provider or agency directory remains authoritative for legal name, email, employee
identifier, eligibility, and account status unless the organization explicitly
designates another source.

- Users may edit only their own approved profile fields.
- Show which fields are IdP-managed/read-only and provide a support process for
  correcting authoritative fields.
- Administrators may view needed profile data, but should not impersonate a user or
  silently rewrite a user's profile; any exceptional administrator correction must
  be permissioned and audited.
- Never treat avatar, display name, email, or profile metadata as an authorization
  factor.

### Avatar controls

Decide whether avatars are needed for the workflow. If enabled:

- Store uploaded images in an approved private object store, not a public bucket
  or third-party avatar URL service.
- Validate file size and actual decoded image format, not only the submitted MIME
  type or filename. Allow a short list of raster formats (for example, PNG/JPEG/WebP);
  reject SVG and active/animated formats unless explicitly reviewed.
- Decode and re-encode uploaded images to a standardized size/format; strip EXIF
  and embedded metadata. Consider malware scanning where required.
- Use a small size/pixel limit, random server-generated storage keys, and safe
  content-type handling. Do not serve the original upload directly.
- Require authenticated upload, authorize ownership, protect upload/delete
  operations against CSRF, and rate-limit.
- Use private, short-lived authorized delivery (or an approved same-origin private
  proxy); never expose a stable public object URL.
- Provide a clear/remove option and an accessible initials placeholder.
- Define retention and deletion when a profile is deactivated.

For CJIS/ePHI scope, have the agency/privacy team decide whether profile images are
permitted, whether photos could expose sensitive personal information, and what
storage/access rules apply. Default to no avatar until approved; avatars should
never be required for login.

## 7. Auditing and notifications

Audit successful and failed privileged changes, including:

- Invitations, activation, suspension, deactivation, and account reactivation.
- Group membership, role, form/action grant, administrator, and approval changes.
- Organization/security setting changes, including setting identifier and effective
  version.
- API environment/hostname changes, tests, secret create/replace/rotate/revoke
  events, and integration enablement.
- Profile changes and avatar add/replace/remove. Minimize logged personal content.

Record actor, target user or setting, timestamp, action, outcome, approver, reason
when required, and request/correlation ID. Do not log passwords, tokens, API
secrets, full profile payloads, sensitive image contents, CJI, ePHI, or API
request bodies. Send security-relevant events to approved protected audit
monitoring. Notify the affected user or designated owner when their access,
authentication, or profile changes as policy requires.

## 8. Suggested screens

- **User directory:** searchable and filterable list, status, groups, role/grants,
  last access, review date; never reveal authentication secrets.
- **Invite/edit user:** IdP-linked identity, sponsor/approver, group and form-specific
  access, effective date, expiration/review date, and reason.
- **User access detail:** current vs. requested access, approvals, access-change
  history, suspend/revoke action, and active-session revocation.
- **Organization settings:** grouped low-risk settings with type-aware validation,
  preview, version history, and approval indicators.
- **API integrations:** environment, approved host, auth method, credential status,
  last rotation, owner, sanitized connection test, and enable/disable state.
- **My profile:** editable personal preferences, IdP-managed fields marked read-only,
  optional approved avatar upload/remove, and profile change history.
- **Audit view:** appropriately restricted events, filters, and export only when
  policy allows.

## 9. Phased implementation

1. **Client/agency discovery**
   - Decide identity source, user invitation/approval, group and form permissions,
     lifecycle, avatar need, settings categories, and API provider details.
   - Confirm CJIS/HIPAA/state policies, agency authorization, vendors, data flows,
     audit and retention, separation of duties, and security ownership.
2. **Authorization model**
   - Add explicit provisioned users, groups, grants, approver metadata, status,
     effective dates, and access-review records.
   - Map IdP stable subjects and authoritative group claims; fail closed if unmapped.
   - Write server-side authorization tests before the administration UI.
3. **User administration**
   - Implement approved invites/provisioning, group/form grant management, access
     review, suspension/deactivation, session revocation, and auditable notifications.
4. **Profile**
   - Implement only approved self-service fields. Add private avatar upload after
     storage, validation, access, retention, and privacy review.
5. **Organization settings**
   - Implement low-risk versioned settings and reviewed change workflows. Keep
     security-critical policy and infrastructure configuration out of general
     admin controls unless specifically approved.
6. **API connection settings**
   - Implement endpoint allowlisting and approved secret-vault integration in a
     non-production environment. Test safely without transmitting sensitive data.
7. **Production readiness**
   - Independent security assessment, negative authorization/SSRF/upload tests,
     audit and secret-redaction verification, access-revocation exercise, incident
     and credential-rotation rehearsal, agency authorization, and operational
     training.

## 10. Client questions

1. Which IdP/directory is approved, and how should users be invited/provisioned?
2. Who sponsors and approves access? Is dual approval needed for administrators,
   cross-group access, production settings, or API credentials?
3. Are memberships and grants sourced from the IdP, managed in this app, or split?
   Which system is authoritative, and who reviews access?
4. Which groups and form-level actions exist, including export, completion,
   reporting, and administration?
5. What are the suspension/offboarding deadlines and session-revocation expectations?
6. Which app settings may administrators safely edit? Which must remain
   deployment/agency-controlled?
7. Which third-party API is planned? What sandbox/production hosts, auth method,
   credential scopes, rotation, support, retention, and data-processing agreements
   are approved?
8. Should API secrets live in the organization's cloud vault or another approved
   secrets manager? Which operators may rotate or revoke them?
9. Is profile self-service needed beyond a display name? Which profile attributes
   come from the IdP?
10. Are avatars necessary and permitted for an application handling this data?
    Which storage provider, visibility, size/formats, retention, and review
    controls are approved?
11. What audit events, notifications, retention, SIEM routing, and user-facing
    history are required?

## 11. Go-live gates

- [ ] Agency/security/privacy approval of identity provider, account lifecycle,
  group/grant model, configuration, vendors, and data flows.
- [ ] No production shared/demo/local account, self-registration, default admin,
  or weak fallback authentication.
- [ ] User provisioning, least-privilege approval, access reviews, deactivation,
  and server-side session revocation are tested.
- [ ] Secrets are held in the approved vault; endpoint allowlisting, secret
  rotation/revocation, and sanitized logging are tested.
- [ ] Administrator boundaries, separation of duties, privileged changes, and
  CSRF/authorization checks are verified.
- [ ] Avatar upload is disabled unless approved; if enabled, private storage,
  content validation/re-encoding, metadata removal, access and deletion are tested.
- [ ] Audit, alerts, incident response, retention, vulnerability/security review,
  operational training, and system authorization are complete.
