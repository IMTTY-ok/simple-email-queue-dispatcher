# Email Queue Dispatcher

> A **real SMTP email dispatcher** with a bounded retry engine.
> React + TypeScript (Vite) on the front, Firebase Cloud Functions + Firestore +
> Nodemailer on the back.
>
> Add emails → the dispatcher dequeues them **FIFO** → sends them over **real SMTP** →
> live delivery status streams back to the dashboard through Firestore realtime
> listeners, with automatic retries on failure.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D20-3FA111?logo=node.js)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/typescript-6-3178C6?logo=typescript)
![Firebase](https://img.shields.io/badge/firebase-12-FFCA28?logo=firebase)

---

## Table of contents

- [The five modules](#the-five-modules)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Firebase configuration](#firebase-configuration)
- [Project structure](#project-structure)
- [How the dispatcher works](#how-the-dispatcher-works)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Testing](#testing)
- [Scripts](#scripts)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## The five modules

The application is organised into the five modules of the product requirements
document. Each module owns its own UI, its own client hook and — where it needs
one — its own server-side service.

### 1. Email Queue Creator

*Responsible for creating and storing email tasks.*

- Add an email to the queue with a validated recipient, subject and message
- Unique IDs are generated automatically (`EML-001`, `EML-002`, …)
- The queue position of a new email is reported back immediately
- Empty emails are refused; the input is cleared after a successful add
- The FIFO queue is visualised from FRONT to REAR, and a queued email can be removed

| Frontend | Backend |
| --- | --- |
| `src/modules/module-1-email-queue-creator/` | `functions/src/modules/module-1-email-queue-creator/` |

### 2. Send Simulator

*Determines whether an email delivery succeeds or fails.*

- **Real SMTP** through Nodemailer — Gmail (App Password), Outlook, Zoho, any relay
- **Dry-run simulator** with the three simulation modes:
  - `AUTOMATIC` — pseudo-random success/failure
  - `FORCE_SUCCESS` — every attempt succeeds
  - `FORCE_FAILURE` — every attempt fails (used to demonstrate the retry engine)
- *Test Connection* and *Send a test email* validate the credentials before dispatching

| Frontend | Backend |
| --- | --- |
| `src/modules/module-2-send-simulator/` | `functions/src/modules/module-2-send-simulator/` |

### 3. Retry Logic Engine

*The main logic of the project.*

- A failed email is retried up to `retryLimit` times
- `retryLimit = 3` → 1 initial attempt + 3 retries = **4 total attempts**
- The limit is configurable from the dashboard (0–10) and clamped server-side
- Backoff between attempts, plus a configurable processing speed (Slow / Normal / Fast)
- Start / Pause / Resume / Stop / Reset — pausing is cooperative and requeues the
  in-flight email so nothing is ever stranded off-queue

| Frontend | Backend |
| --- | --- |
| `src/modules/module-3-retry-logic/` | `functions/src/modules/module-3-retry-logic/` |

### 4. Final Status Logger

*Maintains the complete history of every email.*

- Every attempt is appended to the email document: attempt number, result, detail, timestamp
- Every transition is written to a global activity log rendered live in the dashboard
- The final status (`DELIVERED` / `FAILED`) and the retry count are recorded per email

| Frontend | Backend |
| --- | --- |
| `src/modules/module-4-final-status-logger/` | `functions/src/modules/module-4-final-status-logger/` |

### 5. Summary Exporter

*Summary dashboard and exportable dispatch report.*

- Live statistics: total, queued, sending, delivered, failed, attempts, retries, success/failure rate
- A results table with the final status of every processed email
- Export the whole dispatch report as **CSV** or **JSON**, including the SMTP
  response and the error detail of every attempt

| Frontend | Backend |
| --- | --- |
| `src/modules/module-5-summary-exporter/` | `functions/src/modules/module-5-summary-exporter/` |

---

## Features

### Real email sending
- SMTP via Nodemailer — works with Gmail (App Password), Outlook, Zoho, relays
- Live dispatch status: `DELIVERED` when the server accepts (250), `FAILED` when it refuses
- Dry-run mode simulates the whole queue/retry flow without any credentials

### Queue and retry
- Strict FIFO — emails are processed in the exact order they were added
- Bounded retry — up to `retryLimit` retries (4 attempts by default)
- A dispatch **lease** guarantees that only one invocation sends at a time, so two
  browser tabs can never send the same email twice
- Emails stranded by a killed invocation are reclaimed by a stale-lease sweep and requeued

### Dashboard
- Animated statistic counters
- Live FIFO queue visualisation with the active item highlighted
- Processing panel with the current attempt, a progress bar and the per-attempt history
- Colour-coded activity log
- Dispatch summary with CSV / JSON export

---

## Screenshots

| Dashboard | Queue & processing | Dispatch in progress |
| --- | --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Desktop](docs/screenshots/desktop.png) | ![Retrying](docs/screenshots/dispatch-retrying.png) |
| Statistic cards, mode banner, live counters | FRONT → REAR queue, attempt progress, history | The retry engine working through a failed attempt |

| Activity log | Dispatch summary & export | Mobile |
| --- | --- | --- |
| ![Activity log](docs/screenshots/activity-log.png) | ![Dispatch finished](docs/screenshots/dispatch-finished.png) | ![Mobile](docs/screenshots/mobile.png) |
| Timestamped, colour-coded dispatch events | Statistics, results table, CSV/JSON export | The same dashboard at phone width |

More captures live in [`docs/screenshots/`](docs/screenshots/).

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend framework | React 19 + TypeScript 6 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| State | React hooks (`useState`, `useRef`, `useCallback`) — no Redux |
| Realtime data | Firestore realtime listeners (`onSnapshot`) — no polling |
| Backend | Firebase Cloud Functions (Node 20), Express 4 |
| Database | Cloud Firestore (Admin SDK writes, browser reads) |
| Email transport | Nodemailer 10 |
| Linting | oxlint |
| Testing | Node's built-in test runner (`node --test`) — no test framework dependency |

---

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- The Firebase CLI (installed as a dev dependency — used through `npm run dev`)
- An SMTP account for real sending. For Gmail: enable 2FA → create an **App
  Password** (`myaccount.google.com → Security → App passwords`).
  A dry-run works without any of this.

### Install

```bash
npm install          # frontend dependencies
npm run dev:setup    # backend dependencies (functions/)
```

### Run

```bash
npm run dev
```

This starts the Firebase emulators (functions + firestore) **and** the Vite dev
server together.

| Service | URL |
| --- | --- |
| Dashboard | <http://localhost:5173> |
| Functions emulator | `http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend` |
| Emulator UI | <http://localhost:4000> |

The Vite dev server proxies `/api/*` to the Functions emulator, so the dashboard
needs no environment variables locally.

### Demo walkthrough

1. Open <http://localhost:5173>
2. **Load Demo Data** — five sample emails enter the queue
3. Click **Start** — watch the queue drain, FRONT to REAR
4. **Demonstrate the retry engine**: enable *Dry-run*, choose *Force Failure*,
   save, and start again — every attempt fails and the retry counter climbs
5. **Real email**: fill in the SMTP credentials → *Test Connection* → *Send a test
   email* to yourself → disable dry-run → *Start*

---

## Environment variables

### Frontend — `.env.local` (copy `.env.example`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | for deployments | Base URL of the Cloud Function. Leave unset locally — the dev proxy forwards `/api` to the emulator. |
| `VITE_FIREBASE_*` | optional | Point the dashboard at your own Firebase project instead of the demo one. |

> Only `VITE_`-prefixed variables reach the browser bundle. **Never** put an SMTP
> password in a `VITE_` variable — it would ship to the client in plain text.

### Backend — `functions/.env` (copy `functions/.env.example`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / `587` / `false` | Mail server (587 = StartTLS, 465 = SSL) |
| `SMTP_USER` / `SMTP_PASS` | — | Login (Gmail: App Password) |
| `FROM_NAME` / `FROM_EMAIL` | `Email Dispatcher` / `SMTP_USER` | Sender identity shown to recipients |
| `RETRY_LIMIT` | `3` | Retries after the initial attempt (max attempts = limit + 1) |
| `RETRY_DELAY_MS` | `3000` | Backoff between attempts |
| `INTER_EMAIL_DELAY_MS` | `1200` | Pause between two consecutive emails |
| `SMTP_DRYRUN` | `false` | Simulate delivery without contacting a mail server |
| `SIMULATION_MODE` | `AUTOMATIC` | `AUTOMATIC` \| `FORCE_SUCCESS` \| `FORCE_FAILURE` |
| `ALLOWED_ORIGIN` | localhost origins | Comma-separated CORS allowlist. State-changing requests from any other origin are refused with **403**. |

In production, keep the password out of the environment file entirely:

```bash
firebase functions:secrets:set SMTP_PASS
```

The dashboard can also set the password at runtime — it is then stored in
Firestore under `_secrets/main`, which the Firestore rules deny to browsers.

---

## Firebase configuration

`firebase.json` wires the three pieces together:

```jsonc
{
  "functions": { "source": "functions", "runtime": "nodejs20" },
  "firestore":  { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators":  { "functions": { "port": 5001 }, "firestore": { "port": 8080 } }
}
```

- **`.firebaserc`** — the default project id. Change it to your own project.
- **`firestore.rules`** — the browser may only *read*; every write goes through the
  Cloud Function (Admin SDK). `_secrets/*` is denied to browsers entirely.
- **`firestore.indexes.json`** — the composite index the FIFO query needs
  (`status` + `seq`).

### Deploying

```bash
# 1. build the frontend against the deployed function
VITE_API_URL=https://us-central1-<project>.cloudfunctions.net/backend npm run build

# 2. allow the frontend origin to call the function
firebase functions:config:set  # or set ALLOWED_ORIGIN in the function environment

# 3. deploy the backend, the rules and the indexes
firebase deploy --only functions,firestore
```

---

## Project structure

```
email-queue-dispatcher/
│
├── src/                                   # Frontend (React + TypeScript)
│   ├── App.tsx                            # page layout — composes the five modules
│   ├── main.tsx                           # entry point
│   ├── index.css                          # Tailwind layers + the design system
│   │
│   ├── modules/
│   │   ├── module-1-email-queue-creator/  # Module 1
│   │   │   ├── components/
│   │   │   │   ├── AddEmailForm.tsx       # validated "add to queue" form
│   │   │   │   ├── DemoDataButton.tsx     # loads the five demo emails
│   │   │   │   ├── QueuePanel.tsx         # FRONT → REAR visualisation
│   │   │   │   └── QueueItem.tsx          # status badge, attempts, remove
│   │   │   └── hooks/useQueueActions.ts   # enqueue / remove / demo data
│   │   │
│   │   ├── module-2-send-simulator/       # Module 2
│   │   │   ├── components/SettingsPanel.tsx  # SMTP config + simulation mode
│   │   │   └── hooks/useSimulatorConfig.ts   # save / test connection / test send
│   │   │
│   │   ├── module-3-retry-logic/          # Module 3
│   │   │   ├── components/
│   │   │   │   ├── ProcessingPanel.tsx    # live attempt + attempt history
│   │   │   │   └── RetrySettingsPanel.tsx # retry limit + processing speed
│   │   │   └── hooks/useDispatchControls.ts # start / pause / resume / reset
│   │   │
│   │   ├── module-4-final-status-logger/  # Module 4
│   │   │   └── components/ActivityLog.tsx # the live activity log
│   │   │
│   │   └── module-5-summary-exporter/     # Module 5
│   │       ├── components/
│   │       │   ├── StatsCards.tsx         # animated counters
│   │       │   └── ExportPanel.tsx        # summary, results table, export
│   │       └── utils/exportReport.ts      # CSV / JSON serialisation
│   │
│   └── shared/                            # used by more than one module
│       ├── api/client.ts                  # apiUrl() + the JSON fetch helper
│       ├── components/Header.tsx          # app chrome + dispatch controls
│       ├── constants.ts                   # ports, simulation modes, demo data
│       ├── hooks/
│       │   ├── useDashboardData.ts        # the Firestore realtime listeners
│       │   └── useEmailDispatcher.ts      # wires state to the five modules
│       ├── lib/firebase.ts                # centralised Firebase initialisation
│       ├── mappers.ts                     # Firestore/REST → domain types
│       ├── types/email.ts                 # the shared domain model
│       └── utils/format.ts                # formatting + validation helpers
│
├── functions/                             # Backend (Cloud Functions)
│   ├── index.js                           # HTTPS bootstrap, CORS, rate limit
│   ├── .env.example
│   └── src/
│       ├── routes.js                      # the REST API
│       ├── modules/
│       │   ├── module-1-email-queue-creator/queue.js
│       │   ├── module-2-send-simulator/simulator.js
│       │   ├── module-3-retry-logic/dispatch.js
│       │   ├── module-4-final-status-logger/logger.js
│       │   └── module-5-summary-exporter/summary.js
│       └── shared/
│           ├── config.js                  # env + Firestore config layering
│           ├── http.js                    # ok / fail / async handler wrapper
│           └── store.js                   # Firestore data-access layer
│
├── tests/                                 # unit tests, one file per module
├── scripts/integration-check.mjs          # end-to-end check against the emulator
│
├── firestore.rules                        # browser: read-only, writes denied
├── firestore.indexes.json                 # composite index for the FIFO query
├── firebase.json                          # functions + rules + emulator ports
├── vite.config.ts                         # /api → emulator proxy, code splitting
└── package.json
```

---

## How the dispatcher works

```
claim the dispatch lease                 (only one live pass at a time)
reap emails stranded by a dead invocation
PASS BUDGET = 420s

WHILE inside the budget:
    stop if paused / stopped
    renew the lease
    take the front queued email            (FIFO, by seq)
    mark it SENDING
    attempt = last used attempt + 1
    WHILE attempt <= retryLimit + 1
        send over SMTP
        IF accepted (250)   → log SUCCESS → mark DELIVERED → next email
        ELSE                → log FAILURE
                               IF last attempt → mark FAILED → next email
                               ELSE → mark RETRYING → backoff(retryDelayMs)
        stop if paused → requeue the email → exit the pass
    pace(interEmailDelayMs)

release the lease → { done, remaining }   (the dashboard calls /continue if needed)
```

Cloud Functions are ephemeral, so the engine runs as a **bounded dispatch pass**
rather than one endless loop. The dashboard keeps a pass alive by calling
`POST /api/dispatch/continue` while work remains.

---

## API reference

All endpoints live under the Cloud Function base URL.

| Method | Endpoint | Module | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | — | service health, dispatcher state, statistics |
| GET | `/api/config` | 2 | read the SMTP + dispatcher configuration |
| POST | `/api/config` | 2 | update the SMTP + dispatcher configuration |
| POST | `/api/config/test` | 2 | verify the SMTP connection |
| POST | `/api/config/test-send` | 2 | send an immediate test email |
| GET | `/api/emails` · `/api/emails/:id` | 1 | all emails / one email |
| POST | `/api/emails` · `/api/emails/batch` | 1 | enqueue one / many emails |
| DELETE | `/api/emails/:id` | 1 | remove an email from the queue |
| GET | `/api/activity` | 4 | the activity log |
| GET | `/api/stats` | 5 | live statistics |
| GET | `/api/report` | 5 | the full dispatch report (summary + rows) |
| POST | `/api/dispatch/start`·`continue`·`pause`·`resume`·`stop`·`reset` | 3 | dispatcher lifecycle |

Live dashboard data is **not** polled — it arrives through Firestore `onSnapshot`
listeners.

---

## Data model

```typescript
interface Email {
  id: string;              // "EML-001"
  seq: number;             // monotonic insertion sequence (FIFO order)
  recipient: string;
  subject: string;
  message: string;
  senderName?: string | null;
  status: 'QUEUED' | 'SENDING' | 'RETRYING' | 'DELIVERED' | 'FAILED';
  attempts: number;        // SMTP attempts made
  retries: number;         // attempts - 1
  retryLimit: number;
  createdAt: string;
  updatedAt: string;
  finalStatus: 'DELIVERED' | 'FAILED' | null;
  socketErr: string | null;               // last delivery error, if FAILED
  smtp: { accepted: string[]; response: string; messageId: string } | null;
  logs: { attempt: number; result: 'SUCCESS' | 'FAILURE'; detail?: string; timestamp: string }[];
}
```

Firestore layout: `emails`, `activity`, `stats/main`, `_meta/main` (dispatcher
state + sequence counters), `_config/main` (dashboard-editable configuration),
`_secrets/main` (the SMTP password — never browser-readable).

---

## Testing

```bash
npm test              # 40 unit tests, one file per module (node --test)
npm run test:integration   # 62 assertions against the running emulator
npm run lint          # oxlint over src, functions, tests and scripts
npm run typecheck     # tsc -b
```

The unit tests cover the pure logic of each module: the queue validation rules,
the three simulation modes and the dry-run transport, the attempt budget and
progress maths, the status → counter mapping, and the CSV/JSON exporters.

The integration check exercises all five modules over the real HTTP API
against the Firebase emulator — including the failure/retry path, pause/resume,
email removal and the origin enforcement on the state-changing endpoints.

```bash
npm run dev            # in one terminal
npm run test:integration   # in another
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Firebase emulators + Vite dev server (concurrently) |
| `npm run dev:web` | Vite dev server only |
| `npm run dev:emulators` | Functions + Firestore emulators only |
| `npm run dev:setup` | `npm install --prefix functions` |
| `npm run build` | `tsc -b` + production Vite build |
| `npm run typecheck` | TypeScript project build (types only) |
| `npm run lint` | oxlint |
| `npm test` | unit tests |
| `npm run test:integration` | end-to-end check against the emulator |
| `npm run preview` | preview the production build |

---

## Security

- **The SMTP password never reaches the browser.** It lives in Firestore under
  `_secrets/main`, which the Firestore rules deny to browsers, or in a Firebase
  secret. The API only ever returns a `hasPassword` boolean.
- **Only the Cloud Function writes.** The browser is read-only in Firestore, and
  the rules deny every unmatched path.
- **State-changing requests must come from an allowed origin.** `POST`, `PUT`,
  `PATCH` and `DELETE` are refused with `403` unless the `Origin` header is in
  the `ALLOWED_ORIGIN` allowlist. This stops a third-party website from driving
  the dispatcher through a visitor's browser.
- **Rate limiting** — 60 state-changing requests per minute per IP.
- **Payload limits** — request bodies are capped at 100 kB and a batch may hold
  at most 100 emails.
- **No secrets in the repository.** `.env`, `*.pem`, `*key*` and service-account
  files are all in `.gitignore`.
- **The Firebase web configuration is public by design** — it identifies the
  project and is readable from the shipped JavaScript. The security boundary is
  the Firestore rules, not the API key. Set `VITE_FIREBASE_*` to use your own
  project.

> **Before using this in production:** the dashboard currently reads the queue
> anonymously, so anyone who knows the project id can read the queued email
> content. Enable Firebase Authentication and change
> `allow read: if true` to `allow read: if request.auth != null` in
> `firestore.rules` if the queue may contain real recipients.

---

## Contributing

Contributions are welcome.

1. Fork the repository and create a branch:
   `git checkout -b feature/your-change`
2. Install the dependencies: `npm install && npm run dev:setup`
3. Make your change — keep the five module boundaries intact: a feature that
   belongs to a module lives in that module's directory, on both the frontend
   and the backend.
4. Verify it: `npm run lint && npm run typecheck && npm test`
   and, with the emulators running, `npm run test:integration`
5. Commit with a clear message and open a pull request describing the change
   and how it was verified.

Please do not commit `node_modules`, `dist`, `.env` files, logs or any
credential.

---

## License

MIT — free to use for educational purposes. See [LICENSE](LICENSE).

---

> Built by [Imtty](https://github.com/IMTTY-ok) as a college project demonstration.
