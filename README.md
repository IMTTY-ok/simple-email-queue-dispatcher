# Email Queue Dispatcher

> A **real SMTP email dispatcher** dashboard built with React + TypeScript (frontend) and Express + Nodemailer (backend).
> Add emails → the server dequeues them **FIFO** → sends them over **real SMTP** → live delivery status is streamed back to the dashboard over **SSE**, with automatic retries on failure.

---

## Live Preview

> Run both servers with one command:
>
> ```bash
> npm install
> npm run dev
> ```
>
> Frontend: [http://localhost:5173](http://localhost:5173) · API: [http://localhost:5001/api](http://localhost:5001/api)

---

## What changed from the simulation version

The first version simulated delivery in the browser (Random / Force-Success / Force-Failure, `PENDING`/`PROCESSING` statuses, localStorage).

This version sends **real emails**:

| Aspect | Simulation version | Real version |
|--------|-------------------|--------------|
| Sender | `Math.random()` | **Nodemailer → SMTP** (Gmail/Outlook/Zoho/any) |
| Queue | in-browser state | **Express server** (in-memory) |
| Status | `PENDING/PROCESSING` | `QUEUED/SENDING/RETRYING/DELIVERED/FAILED` |
| Live updates | React state | **SSE** events pushed to the dashboard |
| Delivery proof | none | SMTP `250 OK` response, `accepted` recipients, `messageId`, hard-bounce/refusal errors |
| Persistence | localStorage | server memory (config survives via `.env`) |

---

## Features

### Real Email Sending
- **SMTP via Nodemailer** — works with Gmail (App Password), Outlook, Zoho, college mail servers, or `smtp2go`-style relays
- **Live dispatch status** — `DELIVERED` when the SMTP server accepts (250), `FAILED` when it refuses (bad recipient, auth error, host down)
- **Test connection** button + **send a test email** button to validate credentials before dispatching
- **Dry-run mode** — simulate the full queue/retry demo offline, no email account needed

### Queue + Retry (real)
- **FIFO** — emails processed strictly in insertion order (server-side)
- **Bounded retry** — failed deliveries retried automatically up to a configurable `retryLimit` (1 initial + N retries)
- **Start / Pause / Resume / Reset** — dispatcher lifecycle driven from the Header (pause is checked between attempts)
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
- **Animated stat counters** — Total / Delivered / Failed / Queued + Attempt & Retry totals
- **Live FIFO queue visualization** — FRONT → REAR, active item highlighted, per-attempt badges
- **Processing panel** — current email, attempt progress bar, per-attempt SMTP response / error
- **Activity log** — real-time timestamped events streamed over SSE, color-coded
- **SMTP settings panel** — host/port/secure/user/pass/from-identity, retry limit, dry-run toggle
- **Export** — dispatch report (incl. SMTP response + error detail) as CSV or JSON

---

## Architecture

```
┌────────────────────────────┐        SSE (live events)         ┌────────────────────────────┐
│   React dashboard (Vite)   │ ◄──────────────────────────────── │   Express + Nodemailer     │
│   :5173                    │        REST (emails/config/…)    │   :5001/server              │
│   useEmailDispatcher hook  │ ────────────────────────────────► │   Queue store (FIFO)        │
└────────────────────────────┘    POST /api/emails, /dispatch   │   Dispatcher loop + retry  │
                                                                 │   SMTP transport           │
                                                                 └──────────────┬─────────────┘
                                                                                │ SMTP (250 OK / 550 etc.)
                                                                        ┌───────▼─────────┐
                                                                        │  Mail server     │
                                                                        └─────────────────┘
```

```
Email lifecycle:

  QUEUED ──► SENDING ──► DELIVERED          (SMTP accepted → 250 OK)
     │          │
     │          └── failure ──► RETRYING ──► SENDING ──► … ──► FAILED
     │                             (bounded by retryLimit)
     └── removed by user → gone
```

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- An SMTP account. Gmail example: enable 2FA → create an **App Password** (`myaccount.google.com → Security → App passwords`).

### Run

```bash
# 1. install everything
npm install                 # frontend deps
npm --prefix server install # server deps

# 2. (optional) real SMTP via env — or use the dashboard Settings panel instead
copy server\.env.example server\.env   # then fill in your SMTP credentials

# 3. run both servers
npm run dev                 # API on 5001 (watch mode) + dashboard on 5173
```

> The dashboard's **SMTP Dispatcher Settings** panel can configure SMTP at runtime (no restart needed).
> No `.env` needed for the demo — just tick **Dry-run** and load demo data.

### Demo walkthrough
1. Open [http://localhost:5173](http://localhost:5173)
2. **Settings** → enable **Dry-run** → **Save Config** → **Load Demo Data**
3. Click **Start** — watch 5 emails go `QUEUED → SENDING → DELIVERED`
4. For a failure demo: enter a made-up recipient + a bogus SMTP host, Save, Start → watch retries then `FAILED`
5. For real email: fill in your SMTP credentials → **Test Connection** → **send a test email** to yourself → Start

---

## API Reference (server :5001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | service health, dispatcher state, stats |
| GET/POST | `/api/config` | read / update SMTP + dispatcher config |
| POST | `/api/config/test` | verify the SMTP connection |
| POST | `/api/config/test-send` | send an immediate test email to a recipient |
| GET | `/api/emails` | all emails with statuses + logs |
| POST | `/api/emails` | enqueue one email |
| POST | `/api/emails/batch` | enqueue many emails |
| DELETE | `/api/emails/:id` | remove an email from the queue |
| GET | `/api/activity` · `/api/stats` | activity log / live stats |
| POST | `/api/dispatch/start·pause·resume·stop·reset` | dispatcher lifecycle |
| GET | `/api/events` | **SSE** — snapshot + live `email`/`activity`/`stats`/`dispatcher`/`config` events |

---

## Configuration

All values can come from `server/.env` or the dashboard Settings panel:

| Key | Default | Meaning |
|-----|---------|---------|
| `PORT` | `5001` | API port |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / `587` / `false` | mail server (587 = StartTLS, 465 = SSL) |
| `SMTP_USER` / `SMTP_PASS` | — | login (Gmail: App Password) |
| `FROM_NAME` / `FROM_EMAIL` | `Email Dispatcher` | sender identity shown to recipients |
| `RETRY_LIMIT` | `3` | retries after the initial attempt |
| `RETRY_DELAY_MS` / `INTER_EMAIL_DELAY_MS` | `3000` / `1200` | backoff / inter-email pacing |
| `SMTP_DRYRUN` | `false` | simulate delivery without SMTP |
| `ALLOWED_ORIGIN` | `*` | CORS origin |

---

## Data Model

```typescript
interface Email {
  id: string;              // "EML-001"
  recipient: string;
  subject: string;
  message: string;
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

---

## Project Structure

```
email1/
│
├── src/                            # Frontend (React + TS + Tailwind)
│   ├── components/
│   │   ├── Header.tsx              # Start/Pause/Reset + server connection pill
│   │   ├── SettingsPanel.tsx       # SMTP config, retry limit, dry-run, test send
│   │   ├── AddEmailForm.tsx        # Real email form (POST /api/emails)
│   │   ├── QueuePanel.tsx          # FIFO visualization
│   │   ├── QueueItem.tsx           # Status badge, attempt badges, remove button
│   │   ├── ProcessingPanel.tsx     # Live attempt progress + SMTP response
│   │   ├── StatsCards.tsx          # Animated counters
│   │   ├── ActivityLog.tsx         # SSE-driven log
│   │   └── ExportPanel.tsx         # Summary + CSV/JSON export
│   ├── hooks/useEmailDispatcher.ts # REST client + SSE subscription + actions
│   ├── utils/ (queue.ts, exportReport.ts)
│   ├── types/email.ts
│   └── App.tsx
│
├── server/                         # Backend (Node + Express + Nodemailer)
│   ├── src/
│   │   ├── index.js                # app bootstrap
│   │   ├── routes.js               # REST + SSE routes
│   │   ├── config.js               # env + runtime config (secrets sanitized)
│   │   ├── transport.js            # Nodemailer SMTP transport + dry-run stub
│   │   ├── store.js                # in-memory FIFO queue, log, stats
│   │   ├── dispatcher.js           # async dispatching loop + retry engine
│   │   └── sse.js                  # Server-Sent Events hub
│   └── .env.example
│
├── vite.config.ts                  # /api -> localhost:5001 proxy
└── package.json                    # npm run dev runs BOTH apps (concurrently)
```

---

## How the dispatcher works

```
take email from front of queue        (FIFO)
mark SENDING → consumers notified over SSE

attempt = 1
WHILE attempt <= retryLimit + 1
    sendMail() over SMTP
    IF server accepts (250)  → mark DELIVERED (store smtp.response, messageId) → stop
    ELSE (refusal / error)   → log attempt FAILURE
                               IF last attempt → mark FAILED (store socketErr) → stop
                               ELSE → mark RETRYING, backoff(retryDelayMs), attempt++
move to the next queued email
```

- Resolved `sendMail()` → **DELIVERED** (message accepted by the mail server).
- Thrown `sendMail()` (e.g. `550 recipient rejected`, `ENOTFOUND`, bad auth) → **failure path**, bounded retries, then `FAILED`.
- Pause is cooperative: the loop checks the pause flag before each attempt and during backoff.

---

## Edge Cases Handled

- Start with an empty queue → clear warning from the server
- Start with no SMTP configured (and no dry-run) → guarded error from the dispatcher
- Invalid recipient / subject / message → 400 with a readable message
- Reset while dispatching → confirmation dialog
- Multiple dashboards open → all stay in sync via the SSE hub
- Server crash mid-send → queue is in memory; restart and re-dispatch
- Retry limit clamped 0–10 server-side; never exceeds configured attempts

---

## Concepts Demonstrated

| Concept | Implementation |
|---------|---------------|
| **Queue / FIFO** | `emails[]` server-side, dequeue from front via `nextQueued()` |
| **Retry pattern** | bounded retry loop with configurable limit and backoff |
| **State machine** | QUEUED → SENDING → (RETRYING) → DELIVERED / FAILED |
| **Async processing** | non-blocking `async/await` dispatcher; UI stays live |
| **Live streaming** | SSE server-push to the observer-style dashboard |
| **Clean separation** | queue store, transport, dispatcher, routes, SSE hub |

---

## License

MIT — free to use for educational purposes.

---

> Built by [Imtty](https://github.com/IMTTY-ok) as a college project demonstration.