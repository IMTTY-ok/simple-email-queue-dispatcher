# Security Remediation Report

## 1. Original Vulnerability

GitHub Secret Scanning raised a **"Google API Key – Public Leak"** alert for
`src/shared/lib/firebase.ts` (reported location `src/lib/firebase.ts`, line 8 in
an earlier layout). A Google API key (the Firebase web client API key) was
hard-coded as a fallback value in the client-side Firebase initialisation:

```ts
apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIza…(redacted)',
```

The same value was also allow-listed in `scripts/privacy_scan.py`, so the
repository's own privacy scanner treated it as an "expected" (non-secret)
value rather than flagging it.

## 2. Root Cause

The Firebase web configuration was shipped with literal demo-project values as
fallbacks so the repository worked out of the box. One of those values — the
`apiKey` — matches the `AIza…` pattern that GitHub's secret scanner (and Google
Cloud) classifies as a Google API key. Even though Firebase web API keys are
public client identifiers (they only identify the project and are readable from
the shipped bundle), embedding the literal value in source triggered the alert
and left the value in every historical commit.

Contributing factors:

- No `.env` / `.env.local` separation for the Firebase web config in the
  committed template beyond empty placeholders; the real key lived in code.
- `scripts/privacy_scan.py` explicitly allow-listed the key, masking the
  exposure from the local scan.

## 3. Files Modified

- `src/shared/lib/firebase.ts` — removed the hard-coded `apiKey` fallback;
  `apiKey` is now read solely from `VITE_FIREBASE_API_KEY`.
- `.env.example` — clarified that `VITE_FIREBASE_API_KEY` is required and that
  the remaining values fall back to the bundled demo project.
- `scripts/privacy_scan.py` — removed the key from the `EXPECTED` allow-list so
  any re-introduction is detected.

No other source, test, configuration, or dependency files were changed.

## 4. Changes Implemented

- Firebase client config is now driven by environment variables
  (`VITE_FIREBASE_API_KEY`, with the non-secret identifiers retaining their
  existing demo-project fallbacks).
- `.env` / `.env.local` / `.env.*` remain excluded by `.gitignore`
  (verified with `git check-ignore`).
- `.env.example` contains placeholders only — no real key.
- Backups of the two modified source files were created before editing and
  stored outside the repository (in the user's temp directory) so they do not
  re-introduce the secret into the working tree.

## 5. Git History Findings (REMEDIATED)

**Status: history has been rewritten and force-pushed to `origin`.** The leaked
value no longer exists in any commit reachable from `origin/main`,
`origin/feature/scheduled-delivery-and-dashboard-redesign`, or the rewritten
`refactor/five-module-organization` branch/tag.

The key was originally present in **three commits**:

- `eadc448` — chore: checkpoint before 5-module restructure
  (`src/lib/firebase.ts`)
- `7bc71a5` — refactor: reorganize into five PRD modules with tests
  (`src/lib/firebase.ts`, `src/shared/lib/firebase.ts`)
- `66708b7` — feat(security): authenticate the dashboard and lock down
  Firestore (`scripts/privacy_scan.py`)

All three (and every downstream commit) were rewritten with `git filter-repo`
(`--replace-text`), replacing the value with `[REDACTED-FIREBASE-WEB-API-KEY]`
everywhere it appeared, including in `scripts/privacy_scan.py`. The rewritten
branches were force-pushed to `origin` (`main`, the feature branch, the
refactor branch, and the `baseline/pre-scheduled-upgrade` tag).

A pre-rewrite backup bundle was saved locally at
`%TEMP%/opencode/backup-before-rewrite.bundle` (not committed).

**Caveat — separate legacy remote:** the `my-second-legacy` remote
(`https://github.com/IMTTY-ok/My-second.git`) still contains the old history
with the key. If that mirror is public, it must be cleaned separately (or the
key rotated — see section 6).

Alternative: rotate the key in Google Cloud (see section 6) and mark the alert
resolved as a false positive for the Firebase web client key, since the
historical value no longer grants access.

## 6. Google Cloud / Firebase Actions Still Requiring Your Attention

These cannot be performed by this agent — they require your Google account:

- [ ] **Restrict the API key by HTTP referrer** in Google Cloud Console →
  APIs & Services → Credentials → the Firebase web key → "Application
  restrictions" → "HTTP referrers (web sites)" → add your production domain
  (e.g. `https://your-domain/*`) and `http://localhost:*` for development.
- [ ] **Restrict the key to the required APIs only** under "API
  restrictions": Firebase Authentication, Cloud Firestore, Firebase Storage,
  Firebase Installations, and (if used) Google Analytics. Remove any
  unrestricted / unused APIs.
- [ ] **Rotate or replace the key** if you consider the exposure to warrant
  it. Because it is a Firebase *web* client key, rotation is optional; if you
  rotate, update `VITE_FIREBASE_API_KEY` in your deployment environment and
  in `.env.local`.
- [ ] **Review Firebase Authentication settings** — confirm only the
  Email/Password provider (and any intended providers) is enabled and that
  sign-up is gated as intended.
- [ ] **Verify Firestore security rules** (`firestore.rules`) — browser clients
  are read-only; all writes go through the Cloud Function; `_secrets/*` is
  denied to browsers. Re-run `npm run test:rules`.
- [ ] **Verify Storage rules** (`storage.rules`) for the attachment bucket.
- [ ] **Confirm no privileged service credentials were exposed** — search the
  repository and history for service-account JSON, `private_key`, and
  `SMTP_PASS`; none were found in this remediation (SMTP password lives in
  Firebase Secret Manager / Firestore `_secrets/main`, which is rules-denied to
  browsers).
- [ ] **Enable Firebase App Check** (recommended) to further protect the
  backend from abuse.

## 7. Build and Test Results

- `npm run typecheck` (`tsc -b`): **passed** (no errors).
- `npm run lint` (`oxlint src functions tests scripts`): **passed** (no
  errors).
- `npm test` (`node --test`): **passed** — 93 tests, 0 failures.
- `npm run build` (`tsc -b && vite build`): **passed** — client bundle
  produced (firebase chunk 380.28 kB gzipped 116.64 kB).
- `npm run scan:privacy`: **clean** — no `google api key` findings in the
  working tree or in any rewritten history blob.
- `git check-ignore .env .env.local .env.production functions/.env`: all
  ignored.
- `grep` for the leaked value across the working tree: **no matches**.

## 8. Remaining Security Risks

- History on `origin` has been rewritten, so the leaked value is no longer
  reachable from `origin`. It may still survive in: forks, clones made before
  the rewrite, the `my-second-legacy` mirror, GitHub caches, and the local
  backup bundle. Rotating the key (section 6) is the only way to fully
  neutralise any surviving copy.
- `.env.local` is gitignored but must still be protected on developer
  machines; do not commit it.
- The Firebase web key remains a public client identifier by design — its
  protection depends on the Google Cloud restrictions (section 6) and the
  Firestore/Storage rules, not on secrecy.
- The `password assignment` finding reported by `privacy_scan.py` in
  `functions/src/modules/module-6-scheduled-delivery/tasks.js:137` is a
  pre-existing false positive (a log message mentioning the word token); no secret is
  present.

## 9. Steps to Verify the GitHub Alert Is Resolved

1. Confirm the working tree contains no key:
   `git grep` / `Select-String` for the key returns no matches.
2. Confirm `.env` is ignored: `git check-ignore .env` prints `.env`.
3. Confirm `.env.example` contains only placeholders.
4. Re-run `npm run build`, `npm run lint`, `npm test` — all green.
5. Apply the Google Cloud restrictions in section 6 (or rotate the key).
6. History has already been rewritten and force-pushed; verify on GitHub that
   the old commits are gone (the pre-rewrite SHAs above no longer resolve).
7. On GitHub, open the Secret Scanning alert and click **"Resolve"** → choose
   "Revoked" (if you rotated the key) or "False positive" (Firebase web client
   key), with a link to this report.
8. (Recommended) **Rotate the key in Google Cloud** (section 6) so the leaked
   value is useless even if any copy survived, then update
   `VITE_FIREBASE_API_KEY` in your deployment environment and `.env.local`.
9. Re-run `npm run scan:privacy` to confirm zero findings.