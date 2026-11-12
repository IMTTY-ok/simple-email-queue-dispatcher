# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's *Report a vulnerability* button on the
repository's **Security** tab, or by email to the maintainer
(`REDACTED-EMAIL`). Please include:

- what the issue is and which component is affected
- how to reproduce it
- the impact you believe it has
- any suggested fix

You can expect an acknowledgement within a few days. If a fix is warranted it
will be released and the advisory published — credit is given unless you prefer
otherwise.

Please give the maintainers a reasonable window to publish a fix before
disclosing publicly.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` | ✅ |

This is a student project with no release branches; only the default branch
receives fixes.

---

## Security practices

### Authentication and authorization

The dashboard is **not** an anonymous application any more. It requires a
Firebase Authentication account (email + password), and the access model has
two roles:

| Role | May do |
| --- | --- |
| `admin` | Everything: SMTP configuration, connection tests, account management, the whole queue |
| `operator` | Day-to-day use: enqueue, remove, dispatch, and read **their own** emails and activity |

How the roles are decided:

- The **first** account ever created on an installation becomes the administrator.
  The decision is made inside a Firestore transaction against a sentinel
  document, so two accounts registering at the same moment cannot both become
  administrators.
- Every later account is an operator.
- A **role is never accepted from the client**. The server reads it from
  `users/{uid}` with the Admin SDK, so a browser cannot promote itself — not
  by changing a request body, and not through the Firestore rules either.
- An administrator cannot demote themselves, which would lock the installation
  out of its own configuration.

### Firestore rules

`firestore.rules` is deny-by-default. It grants:

| Path | Access |
| --- | --- |
| `users/{uid}` | Read: the owner, or an administrator. **Write: never** — roles are server-managed. |
| `emails/{id}` | Read: the owner (or an administrator). **Write: never.** |
| `activity/{id}` | Read: the owner (or an administrator). **Write: never.** |
| `stats/{id}` | Read: any signed-in account. **Write: never.** |
| `_meta/main` | Read: any signed-in account. **Write: never.** |
| `_config/{id}` | Read: administrators only (it holds the SMTP mailbox). **Write: never.** |
| `_secrets/{id}` | **Never readable or writable** by a browser, under any circumstances. |
| everything else | Denied. |

The browser never writes to Firestore. Every write goes through the Cloud
Function, which uses the Admin SDK — and the Admin SDK **bypasses** Firestore
rules. That is exactly why the API authorizes every request itself.

### API authorization

Every endpoint except `GET /api/health` requires a Firebase ID token, sent as
`Authorization: Bearer <token>`. The function verifies the token and resolves
the caller's role before doing anything.

State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) additionally have
to come from an allowed browser origin (`ALLOWED_ORIGIN`). This stops a
third-party website from driving the dispatcher through a visitor's browser,
and it stops plain `curl` calls from silently reconfiguring SMTP or
triggering real deliveries.

A per-IP rate limit applies to the state-changing endpoints. It is
configurable with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`.

### Secrets

- The SMTP password is **never** sent to the browser. It lives in the Firestore
  document `_secrets/main`, which the rules deny to browsers, or in a Firebase
  secret.
- The API only ever returns a `hasPassword` boolean.
- `.env` files are gitignored. `.env.example` files contain placeholders only.
- Service-account JSON files, `*.pem` and `*.key` files are gitignored and
  must never be committed.

### The Firebase web configuration

The Firebase web configuration (API key, project id, app id) is **public by
design** — it is compiled into the browser bundle and readable by anyone. It
identifies the project; it does not grant access. The security boundary is the
Firestore rules plus the API's own authorization.

Even so, the API key should be restricted in the Google Cloud console:

- **Application restrictions** → *Websites* → add your own origins
- **API restrictions** → only the APIs the app actually uses
  (Identity Toolkit, Firestore, Cloud Functions)

### What is still public, and why

The `GET /api/health` endpoint is public on purpose: it reports whether the
service is up, without revealing any queue content.

## Secret management expectations

| Where | What belongs there | Example |
| --- | --- | --- |
| `.env.local` (gitignored) | Browser-side configuration | `VITE_API_URL`, `VITE_FIREBASE_*` |
| `functions/.env` (gitignored) | Server-side configuration for local development | `SMTP_*`, `RETRY_*`, `ALLOWED_ORIGIN` |
| `.env.example` / `functions/.env.example` (committed) | **Placeholders only** | `SMTP_PASS=your-app-password` |
| Firebase function environment | Deployment configuration | `ALLOWED_ORIGIN`, `RATE_LIMIT_MAX` |
| Firebase Secret Manager | Deployment secrets | `SMTP_PASS` |
| Firestore `_secrets/main` | The SMTP password set from the dashboard | written by the Admin SDK only |

Rules of thumb:

1. **Never** put a secret in a `VITE_` variable — it ships to the browser.
2. **Never** put a secret in a file that is committed.
3. If a credential is ever exposed, removing it from the code is **not
   enough** — revoke or rotate it first, then clean the history.

## If you think you found a credential in this repository

Open a private report as described above. Do not include the secret itself in
the report — a filename and a location are enough to find it.
