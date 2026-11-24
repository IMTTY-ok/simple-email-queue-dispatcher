# ALLOWED_ORIGIN Fix Report

## 1. Root cause

The backend's origin guard in `functions/index.js` treated `ALLOWED_ORIGIN` as a
**replacement** for the built-in local development defaults:

```js
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(...).filter(Boolean);
const originList = allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ORIGINS;
```

So whenever `ALLOWED_ORIGIN` was present in `functions/.env` (which the emulator
loads automatically), the defaults (`localhost:5173`, `localhost:4173`, …) were
discarded entirely. A stale or partial value (for example one that only listed
`http://localhost:5173` while the dashboard was served from
`http://localhost:5174` after Vite auto-incremented its port, or one that
omitted `127.0.0.1:5173`) therefore caused every state-changing request to be
rejected with:

> "Origin not allowed. Set ALLOWED_ORIGIN on the function to include this origin."

The comparison itself was already exact (`originList.includes(origin)`), but the
allowlist was built by overriding defaults instead of augmenting them, and the
parsing did not trim/validate entries defensively.

## 2. Why the local origin was rejected

- Browser `Origin` sent: `http://localhost:5173` (or `http://localhost:5174` when
  port 5173 was already occupied).
- Backend `ALLOWED_ORIGIN` (from `functions/.env`) replaced the defaults, so the
  default `http://localhost:5173` entry was only present if the env value happened
  to include it exactly.
- Any port not explicitly listed (e.g. Vite's auto-incremented `5174`) was
  rejected even though it is a legitimate local development origin.

## 3. Files modified

- `functions/index.js` — origin parsing and allowlist construction.
- `vite.config.ts` — fixed dev server port (`5173`, `strictPort: true`) so Vite
  no longer silently moves to another port and desyncs from the allowlist.

## 4. Exact configuration changes

`functions/index.js`:
- Added `parseOrigins()` that splits on `,`, trims whitespace, drops empties,
  and validates each entry as an `http:`/`https:` origin.
- Changed `originList` to `Array.from(new Set([...DEFAULT_ORIGINS, ...configuredOrigins]))`
  so the built-in local defaults can never be disabled by a stale/partial env
  value; production origins are added on top.
- Added `isAllowedOrigin()` performing exact origin comparison (protocol + host +
  port) via `URL` normalisation; no substring matching. Used by both the CORS
  middleware and the mutating-method guard.

`vite.config.ts`:
- Added `server.port = 5173` and `server.strictPort = true`.

## 5. Security measures preserved

- No wildcard (`Access-Control-Allow-Origin: *`) was introduced.
- Origin validation remains enforced for all `POST/PUT/PATCH/DELETE` requests.
- Firebase Authentication and role checks are unchanged.
- Rate limiting and the 100 kb body limit are unchanged.
- No Google API key, SMTP password, or service-account key was restored/exposed.
- `.env` / `.env.local` remain gitignored.
- Firestore rules were not changed.

## 6. Test results

- `npm run typecheck` — passed.
- `npm run lint` — passed (0 errors).
- `npm test` — 93/93 passed.
- `npm run build` — passed.
- Integration: `POST /api/emails` with valid payload returned `ok: true`,
  `EML-001` queued; `GET /api/emails` returned 1 item; `DELETE /api/emails/EML-001`
  removed it; invalid input returned `400 "Please enter a valid email address."`.
- Origin check: `http://localhost:5173` accepted (auth required); previously
  rejected `http://localhost:5174` path no longer reachable because Vite is pinned
  to 5173.

## 7. Confirmation of successful email queue submission

Verified end-to-end against the running emulator: sign in as
`imtiyaz4614c@gmail.com` (admin), `POST /api/emails` with
`{recipient, subject, message}` returned `{ok:true, email:{id:"EML-001", status:"QUEUED"}}`,
queue counter went from 0 to 1, and the new email appeared in the queue. Form-clearing
behaviour is unchanged in the client.

## 8. Remaining issues

- Emulator data is in-memory; the admin account created for testing must be
  recreated after an emulator restart (run `functions/.env` is already configured).
- No persistent emulator data export is configured; optional follow-up.
