# Screenshots

Captured from the running dashboard against the Firebase emulator suite.

| File | What it shows |
| --- | --- |
| `dashboard.png` | the full dashboard with the statistic cards and the mode banner |
| `desktop.png` | the dashboard at 1440 × 900 |
| `laptop.png` | the dashboard at 1280 × 800 |
| `tablet.png` | the dashboard at 834 × 1112 |
| `mobile-viewport.png` | the dashboard at 390 × 844 |
| `mobile.png` | the full dashboard at phone width |
| `activity-log.png` | the live activity log |
| `dispatch-retrying.png` | the retry engine working through a failed attempt |
| `dispatch-finished.png` | the dispatch summary after a run |

Regenerate them with:

```bash
npm run dev              # in one terminal
python scripts/browser_check.py
python scripts/responsive_check.py
```
