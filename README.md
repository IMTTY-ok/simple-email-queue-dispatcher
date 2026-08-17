# Email Queue Dispatcher

> A real-time email queue simulation dashboard built with React, TypeScript, and Tailwind CSS.
> Demonstrates Queue (FIFO), Retry Logic, and Status Logging — designed for college project demonstrations and Data Structures vivas.

---

## Live Preview

> Run locally with `npm run dev` → open [http://localhost:5173](http://localhost:5173)

---

## Screenshots

| Dashboard | Processing & Retry | Activity Log |
|-----------|-------------------|--------------|
| Stats cards, queue visualization, controls | Live attempt progress bar, retry animation | Timestamped color-coded log entries |

---

## Features

### Core Functionality
- **Email Queue (FIFO)** — emails are processed strictly in the order they were added
- **Retry Logic Engine** — failed deliveries are automatically retried up to 3 times (configurable 0–5)
- **4 Total Attempts** — 1 initial + 3 retries = 4 maximum delivery attempts per email
- **Simulation Modes** — Random (60% success), Force Success, Force Failure
- **Start / Pause / Resume / Reset** — full processing lifecycle control
- **Load Demo Data** — instantly load 5 sample emails for viva demonstrations

### Status System
| Status | Description |
|--------|-------------|
| `PENDING` | Waiting in the queue |
| `PROCESSING` | Currently being delivered |
| `RETRYING` | Previous attempt failed, retrying |
| `DELIVERED` | Successfully delivered |
| `FAILED` | Exhausted all retry attempts |

### Dashboard
- **Animated stat counters** — numbers count up smoothly on change
- **Live queue visualization** — FRONT → REAR with active item highlighted
- **Processing panel** — current email, attempt progress bar with shimmer, attempt history
- **Activity log** — real-time timestamped entries, color-coded by type
- **Export** — download full dispatch report as CSV or JSON

### Data Persistence
- Queue state and activity log persist across page refreshes via **localStorage**
- Processing/Retrying emails are safely reset to Pending on reload

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS v3 |
| Icons | Lucide React |
| State | React hooks (`useState`, `useRef`, `useCallback`) |
| Storage | `localStorage` |

No backend. No real emails. Pure frontend simulation.

---

## Project Structure

```
email-queue-dispatcher/
│
├── src/
│   ├── components/
│   │   ├── Header.tsx           # Sticky nav with Start/Pause/Reset controls
│   │   ├── StatsCards.tsx       # Animated stat cards (Total, Delivered, Failed, Pending)
│   │   ├── AddEmailForm.tsx     # Email creation form with validation
│   │   ├── QueuePanel.tsx       # FIFO queue visualization (FRONT → REAR)
│   │   ├── QueueItem.tsx        # Individual queue card with status badge
│   │   ├── ProcessingPanel.tsx  # Active processing view with progress bar
│   │   ├── ActivityLog.tsx      # Live color-coded activity log
│   │   ├── SimulationControls.tsx # Mode, retry limit, speed controls
│   │   └── ExportPanel.tsx      # Summary stats table + CSV/JSON export
│   │
│   ├── hooks/
│   │   └── useEmailQueue.ts     # Central state + async processing engine
│   │
│   ├── utils/
│   │   ├── queue.ts             # FIFO helpers, stats, ID generation, validation
│   │   ├── retryLogic.ts        # maxAttempts(), getDelay(), sleep()
│   │   ├── simulator.ts         # simulateDelivery() — Random / Force modes
│   │   └── exportReport.ts      # CSV + JSON export generators + file download
│   │
│   ├── types/
│   │   └── email.ts             # All TypeScript interfaces and types
│   │
│   ├── App.tsx                  # Root layout
│   └── main.tsx                 # React entry point
│
├── public/
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/IMTTY-ok/My-second.git
cd My-second

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

Output is in the `dist/` folder.

---

## How to Use

### Basic Demo
1. Click **Load Demo Data** to add 5 sample emails to the queue
2. Select **Force Failure** mode to demonstrate full retry logic
3. Click **Start** — watch each email attempt 4 times and fail
4. Change to **Force Success** — click **Reset** → **Load Demo Data** → **Start**
5. Watch all emails deliver on the first attempt

### Manual Demo
1. Fill in the **Add Email** form (Recipient, Subject, Message)
2. Click **Add to Queue** — note the auto-generated Email ID and queue position
3. Add several more emails
4. Configure **Retry Limit** and **Processing Speed** in the controls panel
5. Click **Start Processing**
6. Pause mid-processing with **Pause** and resume with **Start**
7. After processing, click **Export CSV** or **Export JSON**

---

## Data Model

```typescript
interface Email {
  id: string;           // "EML-001"
  recipient: string;    // "student@example.com"
  subject: string;
  message: string;
  senderName?: string;
  status: 'PENDING' | 'PROCESSING' | 'RETRYING' | 'DELIVERED' | 'FAILED';
  attempts: number;     // total delivery attempts made
  retries: number;      // number of retries (attempts - 1)
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
  finalStatus: 'DELIVERED' | 'FAILED' | null;
  logs: AttemptLog[];   // per-attempt result history
}
```

---

## Retry Algorithm

```
Take email from front of queue
attempt = 1

WHILE attempt <= maxAttempts (default: 4)
    Simulate delivery

    IF success
        Mark DELIVERED → stop

    ELSE
        Log failure
        IF attempt == maxAttempts
            Mark FAILED → stop
        ELSE
            Mark RETRYING
            Wait (delay based on speed setting)
            attempt++

Move to next email
```

---

## Simulation Modes

| Mode | Behaviour |
|------|-----------|
| **Random** | Each attempt has a 60% chance of success |
| **Force Success** | Every attempt succeeds immediately |
| **Force Failure** | Every attempt fails (best for retry demo) |

---

## Processing Speed

| Speed | Delay per attempt |
|-------|------------------|
| Slow | 2 seconds |
| Normal | 1 second |
| Fast | 0.4 seconds |

---

## Edge Cases Handled

- Empty queue — shows warning when Start is clicked with no pending emails
- Invalid email address — inline validation with clear error message
- Empty subject / message — form prevents submission
- Reset while processing — confirmation dialog
- Page refresh mid-processing — queue restored, active emails reset to Pending
- Retry limit enforcement — never exceeds configured maximum attempts

---

## Export Format

### CSV
Each row contains: Email ID, Recipient, Subject, Sender Name, Status, Attempts, Retries, Final Status, Created At, Updated At, Attempt Logs

### JSON
```json
{
  "exportedAt": "2026-08-17T...",
  "summary": {
    "totalEmails": 10,
    "delivered": 8,
    "failed": 2,
    "totalAttempts": 19,
    "totalRetries": 9,
    "successRate": "80%",
    "failureRate": "20%"
  },
  "emails": [ ... ]
}
```

---

## Concepts Demonstrated

This project is designed to visually demonstrate the following **Data Structures and Algorithms** concepts:

| Concept | Implementation |
|---------|---------------|
| **Queue** | `Email[]` array — enqueue at rear, dequeue from front |
| **FIFO** | Emails always processed in insertion order |
| **Retry Pattern** | Bounded retry loop with configurable max attempts |
| **State Machine** | Emails transition through well-defined status states |
| **Async Processing** | Non-blocking UI using `async/await` + `requestAnimationFrame` |
| **Observer Pattern** | React state drives real-time UI updates |

---

## License

MIT — free to use for educational purposes.

---

> Built by [Imtty](https://github.com/IMTTY-ok) as a college project demonstration.
