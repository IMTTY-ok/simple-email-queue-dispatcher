# Email Queue Dispatcher

> A **real SMTP email dispatcher** dashboard: React + TypeScript (Vite) on the front,
> Firebase Cloud Functions + Firestore + Nodemailer on the back.
> Add emails → the dispatcher dequeues them **FIFO** → sends them over **real SMTP** →
> live delivery status streams back to the dashboard through Firestore realtime listeners,
> with automatic retries on failure.

---

## Live Preview

```bash
npm install            # frontend deps
npm run dev:setup      # backend deps (functions/)
npm run dev            # Firebase emulators (functions + firestore) AND the Vite dev server
```

Frontend: [http://localhost:5173](http://localhost:5173)
Functions emulator: `http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend`
Emulator UI: [http://localhost:4000](http://localhost:4000)

The Vite dev server proxies `/api/*` to the Functions emulator, so the dashboard needs
no environment variables locally.

---

## Features

### Real Email Sending
- **SMTP via Nodemailer** — works with Gmail (App Password), Outlook, Zoho, college mail servers, relays
- **Live dispatch status** — `DELIVERED` when the SMTP server accepts (250), `FAILED` when it refuses
- **Test connection** + **send a test email** buttons to validate credentials before dispatching
- **Dry-run mode** — simulate the whole queue/retry flow with no SMTP account

### Queue + Retry
- **FIFO** — emails processed strictly in insertion order
- **Bounded retry** — up to a configurable `retryLimit` (1 initial attempt + N retries)
- **Start / Pause / Resume / Reset** from the header; pause is cooperative and
  **requeues the in-flight email** so nothing is ever stranded off-queue
- **Remove queued emails** — trash icon on any `QUEUED` item
- **Load Demo Data** — one-click load of 5 sample emails

### Status System (server-driven)
| Status | Meaning |
|--------|---------|
| `QUEUED` | Waiting in the queue |
| `SENDING` | Dispatcher is talking to the SMTP server |
| `RETRYING` | Previous attempt failed; backing off before the next attempt |
| `DELIVERED` | SMTP server accepted the message (250 OK) |
| `FAILED` | SMTP refused the message after all attempts |

### Dashboard
- **Animated stat counters** — Total / Delivered / Failed / Queued + attempt & retry totals
- **Live FIFO queue visualization** — FRONT → REAR, active item highlighted, per-attempt badges
- **Processing panel** — current email, attempt progress bar, per-attempt SMTP response / error
- **Activity log** — realtime timestamped events, colour-coded
- **SMTP settings panel** — host/port/secure/user/pass/from-identity, retry limit, dry-run toggle
- **Export** — dispatch report (incl. SMTP response + error detail) as CSV or JSON

---

## Architecture

```
┌────────────────────────────┐   Firestore realtime listeners   ┌──────────────────────────────┐
│  React dashboard (Vite)    │ ◄─────────────────────────────── │  Firestore                   │
│  :5173                     │        (emails/activity/         │  emails · activity · stats   │
│  useEmailDispatcher hook   │         stats/_meta/_config)     │  _meta · _config · _secrets  │
│                            │                                  └──────────────▲───────────────┘
│                            │        REST /api/* (JSON)                       │ Admin SDK writes
│                            │ ───────────────────────────────► ┌──────────────┴───────────────┐
└────────────────────────────┘                                  │  Cloud Function `backend`    │
                                                                │  Express router + dispatcher │
                                                                │  Nodemailer SMTP transport   │
                                                                └──────────────┬───────────────┘
                                                                               │ SMTP (250 OK / 550 …)
                                                                       ┌───────▼─────────┐
                                                                       │  Mail server    │
                                                                       └─────────────────┘
```

- **Only the Cloud Function writes** to Firestore; `firestore.rules` gives browsers
  read-only access, and `_secrets/*` (the SMTP password) is denied to browsers entirely.
- Cloud Functions are ephemeral, so the dispatcher is a **bounded dispatch pass** rather
  than a long-lived loop. The dashboard keeps a pass alive by calling
  `POST /api/dispatch/continue` while work remains (the response reports `done` + `remaining`).
- A **dispatch lease** in `_meta/dispatchLease` guarantees only one invocation dispatches
  at a time, so two browser tabs can never send the same email twice.
- Emails left mid-flight by a killed invocation are reclaimed by a stale-lease sweep
  (`reapStale`) and requeued.

```
Email lifecycle:

  QUEUED ──► SENDING ──► DELIVERED          (SMTP accepted → 250 OK)
     │          │
     │          └── failure ──► RETRYING ──► SENDING ──► … ──► FAILED
     │                             (bounded by retryLimit)
     ├── pause / stop mid-flight ──► QUEUED   (requeued, attempts preserved)
     └── removed by user → gone
```

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm
- The Firebase CLI (installed as a dev dependency — used via `npm run dev`)
- An SMTP account for real sending. Gmail example: enable 2FA → create an
  **App Password** (`myaccount.google.com → Security → App passwords`).

### Run

```bash
npm install          # frontend deps
npm run dev:setup    # functions/ deps
npm run dev          # emulators + dashboard together
```

### Demo walkthrough
1. Open [http://localhost:5173](http://localhost:5173)
2. **Settings** → tick **Dry-run** → **Save Config** → **Load Demo Data**
3. Click **Start** — watch 5 emails go `QUEUED → SENDING → DELIVERED`
4. Failure demo: point at a bogus SMTP host, Save, Start → watch retries then `FAILED`
5. Real email: fill in SMTP credentials → **Test Connection** → **send a test email** to yourself → Start

### Scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Firebase emulators + Vite dev server (concurrently) |
| `npm run dev:web` | Vite dev server only |
| `npm run dev:emulators` | Functions + Firestore emulators only |
| `npm run dev:setup` | `npm install --prefix functions` |
| `npm run build` | `tsc -b` + production Vite build |
| `npm run lint` | oxlint |
| `npm run preview` | preview the production build |

### Deploying
1. Build the frontend with the API base set to the deployed function:
   `VITE_API_URL=https://us-central1-<project>.cloudfunctions.net/backend` (see `.env.example`)
   — never put SMTP credentials in a `VITE_` variable, they would ship to the browser.
2. Configure `ALLOWED_ORIGIN` (comma-separated allowlist of frontend origins) for the function.
3. Deploy the function + rules: `firebase deploy --only functions,firestore`.

---

## API Reference (Cloud Function `backend`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | service health, dispatcher state, stats |
| GET/POST | `/api/config` | read / update SMTP + dispatcher config |
| POST | `/api/config/test` | verify the SMTP connection |
| POST | `/api/config/test-send` | send an immediate test email to a recipient |
| GET | `/api/emails` · `/api/emails/:id` | all emails / one email with logs |
| POST | `/api/emails` · `/api/emails/batch` | enqueue one / many emails |
| DELETE | `/api/emails/:id` | remove an email from the queue |
| GET | `/api/activity` · `/api/stats` | activity log / live stats |
| POST | `/api/dispatch/start·continue·pause·resume·stop·reset` | dispatcher lifecycle |

Live dashboard data is **not** polled — it comes from Firestore `onSnapshot` listeners.

---

## Configuration

Environment defaults for the function (Firestore `_config/main` overrides them at runtime;
the SMTP password lives in `_secrets/main` and is never returned to the client):

| Key | Default | Meaning |
|-----|---------|---------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / `587` / `false` | mail server (587 = StartTLS, 465 = SSL) |
| `SMTP_USER` / `SMTP_PASS` | — | login (Gmail: App Password) |
| `FROM_NAME` / `FROM_EMAIL` | `Email Dispatcher` | sender identity shown to recipients |
| `RETRY_LIMIT` | `3` | retries after the initial attempt |
| `RETRY_DELAY_MS` / `INTER_EMAIL_DELAY_MS` | `3000` / `1200` | backoff / inter-email pacing |
| `SMTP_DRYRUN` | `false` | simulate delivery without SMTP |
| `ALLOWED_ORIGIN` | built-in dev/Vercel list | comma-separated CORS allowlist |

---

## Data Model

```typescript
interface Email {
  id: string;              // "EML-001"
  seq: number;             // monotonic insertion sequence (FIFO order)
  recipient: string;
  subject: string;
  message: string;
  senderName?: string;
  status: 'QUEUED' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';
  attempts: number;        // SMTP attempts made
  retries: number;         // attempts - 1
  retryLimit: number;
  createdAt / updatedAt: string;
  finalStatus: 'DELIVERED' | 'FAILED' | null;
  socketErr: string | null;               // last delivery error, if FAILED
  smtp: { accepted: string[]; response: string; messageId: string } | null;
  logs: { attempt: number; result: 'SUCCESS' | 'FAILURE'; detail?: string; timestamp: string }[];
}
```

Firestore layout: `emails`, `activity`, `stats/main`, `_meta/main` (sequence counters +
dispatcher state), `_config/main` (dashboard-editable config), `_secrets/main` (SMTP password).

---

## Project Structure

```
email1/
│
├── src/                            # Frontend (React + TS + Tailwind)
│   ├── components/
│   │   ├── Header.tsx              # Start/Pause/Reset + server connection pill
│   │   ├── SettingsPanel.tsx       # SMTP config, retry limit, dry-run, test send
│   │   ├── AddEmailForm.tsx        # Enqueue form (POST /api/emails)
│   │   ├── QueuePanel.tsx          # FIFO visualization
│   │   ├── QueueItem.tsx           # Status badge, attempt badges, remove button
│   │   ├── ProcessingPanel.tsx     # Live attempt progress + SMTP response
│   │   ├── StatsCards.tsx          # Animated counters
│   │   ├── ActivityLog.tsx         # Realtime log
│   │   └── ExportPanel.tsx         # Summary + CSV/JSON export
│   ├── hooks/useEmailDispatcher.ts # Firestore listeners + REST actions
│   ├── lib/firebase.ts             # Firebase app + Firestore (emulator in DEV)
│   ├── api/client.ts               # apiUrl() helper (VITE_API_URL)
│   ├── utils/ (queue.ts, exportReport.ts)
│   ├── types/email.ts
│   └── App.tsx
│
├── functions/                      # Backend (Cloud Functions + Express + Nodemailer)
│   ├── index.js                    # HTTPS function bootstrap (`backend`) + CORS
│   └── src/
│       ├── routes.js               # REST routes (/api/*)
│       ├── config.js               # env + Firestore config layering (secrets sanitized)
│       ├── firestore.js            # email/activity/stats/meta store + dispatch lease
│       ├── dispatch.js             # bounded dispatch pass + retry engine
│       └── smtp.js                 # Nodemailer transport + dry-run stub
│
├── firestore.rules                 # browser read-only; secrets denied
├── firestore.indexes.json          # composite index for the FIFO query
├── firebase.json                   # functions + emulator ports
├── vite.config.ts                  # /api -> Functions emulator proxy
└── package.json                    # npm run dev runs emulators + dashboard
```

---

## How the dispatcher works

```
claim dispatch lease                     (only one live pass at a time)
reap emails stranded by a dead invocation
PASS BUDGET = 420s

WHILE inside budget:
    stop if paused / stopped
    renew lease
    take the front queued email             (FIFO, by seq)
    mark SENDING
    attempt = last used attempt + 1
    WHILE attempt <= retryLimit + 1
        sendMail() over SMTP
        IF accepted (250)  → log SUCCESS → mark DELIVERED → next email
        ELSE               → log FAILURE
                             IF last attempt → mark FAILED → next email
                             ELSE → mark RETRYING → backoff(retryDelayMs)
        stop if paused → requeue the email → exit pass
    pace(interEmailDelayMs)

release lease → response { done, remaining }   (dashboard re-triggers /continue if needed)
```

- A resolved `sendMail()` → **DELIVERED**; a thrown one (550 refusal, `ENOTFOUND`, bad auth)
  → **failure path** with bounded retries, then **FAILED**.
- Pause is cooperative: the pass checks the flag before each attempt and during backoff,
  and puts the in-flight email back to `QUEUED` with its attempt history intact.

---

## Edge Cases Handled

- Start with an empty queue → clear warning from the server
- Start with no SMTP configured (and no dry-run) → guarded error from the dispatcher
- Invalid recipient / subject / message → 400 with a readable message
- Reset while dispatching → confirmation dialog
- Multiple dashboards open → both stay in sync; the lease prevents duplicate sends
- Function killed mid-send → the email is reclaimed and requeued by the stale sweep
- Pause/resume mid-retry → attempts are preserved, so pausing can't grant extra retries
- Retry limit clamped 0–10 server-side; never exceeds configured attempts

---

## Concepts Demonstrated

| Concept | Implementation |
|---------|---------------|
| **Queue / FIFO** | `emails` collection ordered by `seq`, drained from the front |
| **Retry pattern** | bounded retry loop with configurable limit and backoff |
| **State machine** | QUEUED → SENDING → (RETRYING) → DELIVERED / FAILED, counters kept consistent |
| **Async processing** | bounded async dispatch passes kept alive by the client, with a lease |
| **Live streaming** | Firestore realtime listeners (no polling, no SSE) |
| **Clean separation** | store, transport, dispatch engine, routes |

---

## License

MIT — free to use for educational purposes.

---

> Built by [Imtty](https://github.com/IMTTY-ok) as a college project demonstration.
