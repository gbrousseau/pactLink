# Login and Authentication Plan

**Status:** Planning and client/agency discovery — implementation not started.  
**Goal:** Replace synthetic demo sign-in with an approved, supportable identity
flow that preserves the current group-scoped viewer/editor/administrator
experience and can be assessed for CJIS and HIPAA requirements.

> **Important:** This plan is not a compliance determination, legal opinion,
> authorization to handle CJI/ePHI, or a claim that any provider or configuration
> is compliant. The applicable CJIS policy version, agency requirements, HIPAA
> obligations, contracts, and risk-analysis decisions must be confirmed by the
> responsible agency, CJIS Systems Agency/security officer, Privacy/Security
> Officer, and counsel as appropriate. Continue to use synthetic data only until
> the complete system is approved to handle the applicable data.

## Current flow and boundary

The development prototype currently offers a login page where a user chooses one
of four synthetic demo accounts (North editor, North viewer, South editor, or
administrator). It creates a random token in an HTTP-only cookie and stores a hash
of that token in PostgreSQL. The app reloads the user's role and group from the
database, applies group restrictions server-side, logs successful login and logout,
and expires demo sessions after 20 minutes idle or 8 hours maximum. The session
cookie is deliberately not `Secure` on the local HTTP-only demo. Development login
and database access refuse production mode. These demo credentials, cookie
settings, account choices, session durations, and login screen are **not production
authentication patterns**.

The target flow preserves this application behavior:

- Viewers can read authorized records in their permitted group(s).
- Editors can read and modify records allowed by their group and form-type grants.
- Administrators have only the explicitly approved application-management and
  cross-group privileges.
- Authorization is checked on the server for every record, search, history,
  export, and administrative action. Hiding UI controls is not access control.

**Recommended target:** delegate human authentication to the organization's
approved identity provider (IdP), using a supported OIDC or SAML integration.
Do not implement a local password store, MFA system, or password-recovery service
unless the agency explicitly requires and approves that architecture.

## Target sign-in journey

1. **Reach sign-in:** Require HTTPS; show the agency-approved application identity,
   support contact, and privacy/use notice. Avoid displaying sensitive participant
   information on the unauthenticated screen.
2. **Redirect to the approved IdP:** Use an allowlisted issuer and exact registered
   redirect URI, Authorization Code flow with PKCE, `state` and `nonce`; never
   accept an arbitrary callback, issuer, tenant, or return URL.
3. **Authenticate at the IdP:** Apply approved identity proofing, authentication
   factors, MFA, risk controls, and user lifecycle processes. The application
   receives only the minimum identity/claims it needs.
4. **Validate the response:** Verify signature, issuer, audience, timestamps,
   nonce/state, and required claims; reject invalid or expired responses. Fail
   closed if the IdP or required security dependency is unavailable.
5. **Resolve application access:** Map the stable IdP subject to an active,
   provisioned application account. Load current group membership and
   form-scoped grants from an authoritative managed source. Default to no access
   for missing, ambiguous, suspended, or unmapped accounts. Do not grant the
   administrator role solely from a user-controlled or unverified claim.
6. **Create an application session:** Issue a fresh, opaque, unpredictable,
   rotated session identifier in an HTTPS-only, `Secure`, `HttpOnly`,
   `SameSite` cookie with a narrow path and no broad domain. Store only a
   protected token verifier server-side, with issue/last-activity/expiry and
   revocation state. Do not put CJI, ePHI, credentials, or authorization decisions
   into browser storage or a readable cookie.
7. **Authorize each request:** Re-read or safely refresh account status and grants;
   apply deny-by-default group and form-type checks on the server for every
   operation. Keep application roles separate from IdP authentication
   credentials and personnel/security status.
8. **Reauthenticate where required:** Require fresh IdP authentication/MFA for
   security-sensitive actions when the approved policy calls for it, such as
   privileged user/grant changes, high-risk administrative access, or approved
   sensitive exports. Never make a form-edit or record-read exception that
   bypasses authorization.
9. **Sign out and revoke:** Invalidate the app session server-side, clear the
   cookie, and offer IdP logout only as supported by the selected IdP. Document
   that local logout may not end other IdP sessions, and define revocation behavior
   for SSO sessions and centrally suspended accounts.

## MFA and authenticators

MFA means proving identity with more than one distinct authentication factor,
commonly something the user **knows** (password/PIN), **has** (registered security
key/device), or **is** (biometric). Two passwords do not make two factors. Biometrics
should be used only as part of an approved authenticator/device flow, not stored by
this application.

**Proposed policy for discussion, not a compliance conclusion:**

- Require IdP-enforced MFA for all human accounts with access to sensitive program
  data; define any exceptions through the agency's documented risk and approval
  process.
- Prefer phishing-resistant authenticators such as agency-approved
  FIDO2/WebAuthn security keys or platform authenticators, or approved PIV/CAC
  smart cards where the agency supports them.
- Treat authenticator-app OTP, push approval, SMS, voice, email codes, and
  recovery codes as distinct mechanisms with different risks; do not assume each
  satisfies CJIS or the agency's required assurance level. SMS/voice and email
  alone should not be the default second factor for privileged or sensitive access.
- Confirm authenticator, cryptographic module, device, enrollment, recovery, and
  assurance-level requirements with the CSA/agency and IdP provider before
  selection. NIST SP 800-63B-4 is useful guidance but does not replace CJIS,
  agency-specific, or HIPAA decisions.
- Require stronger or phishing-resistant MFA for administrator and security
  management actions where approved; consider separate privileged accounts.
- Enroll factors through a verified process. Authenticate users before adding,
  replacing, or removing authenticators; notify users of changes; audit and
  support prompt revocation of a lost or compromised factor.
- Provide recovery codes or an assisted recovery process only if approved. Recovery
  must not be weaker than the normal authentication path; verify identity, record
  the recovery action, revoke lost factors and affected sessions, and notify the
  account owner. Help-desk staff cannot simply bypass MFA.

**CJIS policy version and required authentication strength are open decisions.**
Have the agency's CSA/ISO verify the current effective FBI CJIS Security Policy,
implementation schedules, state addenda, and applicable system-specific policy.
Do not select a factor solely because a vendor advertises it as “CJIS compliant.”

## Account, role, and personnel lifecycle

- Use unique, attributable human identities; prohibit shared accounts for routine
  human access.
- Define identity proofing, eligibility, required screening/training, agreements,
  sponsorship, approvals, and role assignment with the responsible agency. These
  obligations can apply beyond the software login screen.
- Provision accounts by approved invitation or authoritative directory/group
  synchronization. Require least-privilege review before first access.
- Keep authentication identity, application roles, groups, and form-type grants as
  distinct concepts. Define which source is authoritative for each.
- Apply default-deny grants. Require a second authorized person or documented
  approval for privileged users if required by agency policy.
- Have supervisors/owners periodically recertify active users, memberships,
  grants, administrators, and service accounts.
- Disable access promptly when users leave, change duties, fail eligibility
  requirements, or are suspended. Revoke active application sessions and review
  outstanding exports/API credentials.
- Use separate, non-human service identities for future integrations; scope,
  rotate, monitor, and revoke them independently. Never reuse human login tokens
  as API credentials.
- Keep emergency/break-glass access disabled until an agency-approved design
  specifies eligibility, strong authentication, time bounds, notification,
  elevated audit, review, and post-use revocation.

## Session, browser, and attack protections

The agency/IdP must set approved idle, absolute, reauthentication, and federation
lifetimes. Do not carry the prototype's 20-minute/8-hour values into production
without approval and usability/risk review.

- Use HTTPS everywhere and approved TLS configuration. Set secure session cookies
  with `Secure`, `HttpOnly`, and an appropriate `SameSite` setting; rotate session
  identifiers at authentication and privilege changes; prevent fixation.
- Enforce session expiry and invalidation on logout, account disablement, group or
  role revocation, password/factor compromise as applicable, and suspected breach.
- Use CSRF defenses, same-origin validation, safe redirect allowlists, secure
  headers, and rate-limited sign-in/callback/recovery endpoints.
- Apply generic login and recovery errors to reduce account enumeration. Avoid
  leaking whether a user, agency, or account is provisioned.
- Rate limit and alert on repeated failures and suspicious sign-ins without
  creating an easy denial-of-service account-lockout mechanism. Have the agency
  approve thresholds, lockout behavior, notifications, and escalation.
- Reauthenticate/step up as required before privileged and other approved
  high-impact actions.
- Do not cache authenticated pages or sensitive responses in shared caches; avoid
  sensitive browser persistence, analytics, session replay, and third-party
  scripts.
- Protect administrative access to the IdP and application infrastructure with
  separate administrator identities, MFA, restricted networks, and auditable
  operations as required by policy.

## Audit and monitoring

Send authentication and security events to the approved protected monitoring
system. At minimum, assess and document logging of:

- Login success/failure, logout, session creation, expiry, revocation, and
  reauthentication.
- IdP issuer/subject reference, authentication method/assurance information, and
  source context only to the extent allowed by policy.
- MFA enrollment, factor replacement/removal, account recovery, suspension,
  provisioning, and deprovisioning.
- Grant/group/role changes, administrator actions, denied access, and policy
  configuration changes.
- Risk signals, rate-limit events, and security-relevant errors.

Record a unique actor, event time from a controlled time source, outcome, and
relevant request/correlation ID. Avoid credentials, tokens, MFA secrets, complete
claims, form answers, CJI, ePHI, and sensitive query contents in ordinary logs.
Restrict, protect, review, retain, and alert on security logs under agency policy.
Define who investigates alerts and how they coordinate incident reporting.

## HIPAA and CJIS governance

HIPAA Security Rule planning involves administrative, physical, and technical
safeguards for electronic protected health information (ePHI), including a
documented risk analysis and management process. Authentication is one control in
that broader program; this login plan cannot by itself make the app HIPAA compliant.
Whether the entity is a covered entity/business associate, and which contracts,
policies, breach/reporting duties, and state laws apply, require organizational
determination.

CJIS responsibility is shared among the agency, CSA/ISO, service provider(s), and
personnel. Determine whether the data/use is CJI and whether this application,
hosting, support, administrators, and other service providers are in scope. Obtain
the current effective CJIS Security Policy and local agreements, role assignments,
screening/training, access, authentication, incident, audit, and cloud/vendor
requirements from the responsible authorities. A secure login implementation or
“government-ready” hosting marketing is not sufficient authorization.

Do not assume CJIS MFA, HIPAA MFA, or a NIST assurance level are interchangeable.
Map the actual required controls to the current governing policy and document
approved exceptions and evidence.

## Architecture and vendor review

Before selecting the IdP or hosting:

- Confirm the agency's approved IdP, tenant/realm, user directory, group source,
  federation protocol, supported assurance/factor options, and environment.
- Confirm the exact cloud/hosting and identity services in scope, regions, support
  access, subcontractors, administrative boundaries, audit features, incident
  notification, retention, and contract/BAA or other agreements as applicable.
- Review data flow: browser, app, IdP, database, logs/SIEM, backup, help desk,
  support vendor, mobile endpoints, and later third-party API.
- Validate cryptographic requirements and implementation evidence; do not equate
  an encryption algorithm name with a required validated cryptographic module.
- Document ownership of configuration, keys, monitoring, patches, vulnerability
  response, access reviews, recovery, and breach response.
- Obtain agency/security approval of the threat model, architecture, test evidence,
  and go-live criteria.

## Delivery plan

1. **Discovery and policy mapping**
   - Identify CJI/ePHI scope, covered entities/business associates, sponsoring
     agency, CSA/ISO, Privacy/Security Officer, and system owner.
   - Obtain the current applicable CJIS policy/local addenda and HIPAA/state
     requirements; complete/refresh risk analysis.
   - Confirm approved identity, MFA/factor choices, user source, provisioning,
     session settings, recovery, audit, vendor/hosting, and support requirements.
2. **Authentication architecture and design**
   - Select the approved IdP and protocol.
   - Define exact claims, stable subject mapping, group/grant synchronization,
     logout/revocation, session controls, incident response, and failure behavior.
   - Define login, first-access, MFA enrollment/recovery, privilege elevation,
     suspended-user, and no-access flows.
3. **Development/test integration**
   - Keep synthetic local demo isolated and production-blocked.
   - Integrate in an approved non-production environment with synthetic test
     identities/data; test issuer/signature/audience/nonce validation, redirects,
     MFA policy, failure modes, account lifecycle, and role/group enforcement.
4. **Security verification**
   - Test CSRF, session fixation/rotation, expiry/revocation, login enumeration,
     rate limiting, callback attacks, group/role escalation, direct-object access,
     audit completeness, and log redaction.
   - Perform the agency-required security assessment and remediate findings.
5. **Authorization and operations**
   - Obtain required agency/system authorization before production CJI/ePHI use.
   - Train users/admins; exercise onboarding/offboarding, lost-factor recovery,
     elevated access, alert triage, incident response, backup/recovery, and access
     recertification.
6. **Ongoing governance**
   - Reassess upon policy, IdP, hosting, code, data-use, or vendor changes.
   - Review accounts, grants, factors, privileged use, sign-in anomalies, exceptions,
     and control evidence at agency-approved intervals.

## Client / agency questions to resolve

1. Which agency sponsors the system, and who is the CSA/ISO and HIPAA
   Privacy/Security Officer or equivalent approver?
2. Which current CJIS Security Policy version, state addendum, agreements, and
   implementation schedule apply? Is the intended information CJI?
3. Is the program/entity a HIPAA covered entity or business associate? Will the
   application hold ePHI? Which BAA and state privacy requirements apply?
4. Does the organization already have an approved IdP and directory? Which tenant,
   federation protocol, user/group source, and authentication assurance levels are
   approved?
5. Which authenticators are agency-approved and supportable for staff: PIV/CAC,
   security keys/passkeys, platform authenticators, authenticator OTP, or other?
   Which are allowed for administrator access? What factor recovery process is
   acceptable?
6. What account proofing, background screening, training, agreements, sponsorship,
   and access-recertification obligations apply to employees, contractors,
   administrators, and vendor support?
7. How should users be assigned to groups and form-specific permissions? Who
   authorizes and periodically reviews those grants? Is separate privileged
   administrator access required?
8. What idle/absolute timeout, reauthentication, failed-login alerting, lockout,
   sign-in notification, and session revocation rules are required?
9. Which system is the authoritative audit/SIEM destination, who reviews it, what
   is its retention period, and how are security incidents reported?
10. Which IdP, hosting, support, mobile, logging, and backup providers/services are
    already approved for this data?
11. What availability and contingency behavior is required if the IdP, network,
    MFA device, or audit system is unavailable? Is there any approved break-glass
    process?

## Go-live checklist

- [ ] Agency/security authorities approve data scope, applicable policy mapping,
  identity architecture, IdP, provider/services, and control ownership.
- [ ] Approved MFA/authenticator, factor lifecycle, recovery, and privileged-access
  policy is configured and independently tested.
- [ ] Production cannot fall back to demo, local, shared, or password-only accounts.
- [ ] Every human has a unique identity and authorized, reviewed, least-privilege
  group/form grants; deprovisioning and revocation are tested.
- [ ] Server-side authorization, session protection, expiry, logout/revocation, and
  cross-group isolation have security test evidence.
- [ ] Auth/audit events flow to the approved protected monitoring system without
  secrets or CJI/ePHI leakage; alert response and reporting are exercised.
- [ ] Required contracts, personnel screening/training, policies, recovery, incident
  response, vulnerability management, and access-review processes are operational.
- [ ] Required security assessment and system/agency production authorization are
  complete. Real data is prohibited until these gates pass.

## References for review

Always confirm the version and applicable requirements with the agency and
security/privacy authorities at implementation time.

- [FBI CJIS Security Policy Resource Center](https://le.fbi.gov/cjis-division/cjis-security-policy-resource-center) — official policy and change materials.
- [NIST SP 800-63B-4, Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html) — digital identity authenticator guidance; not a substitute for CJIS/agency requirements.
- [HHS HIPAA Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/index.html) — HIPAA Security Rule resources. Consult the current rule and organizational counsel/Privacy and Security Officers.
