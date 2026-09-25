import express from 'express';
import cors from 'cors';
import config from './config.js';
import { router } from './routes.js';

const app = express();

app.use(
  cors({
    origin: config.allowedOrigin === '*' ? true : config.allowedOrigin,
  })
);
app.use(express.json({ limit: '100kb' }));

app.use('/api', router);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ ok: false, error: humanMessage(err) });
});

function humanMessage(err) {
  return (err && err.message) || 'Internal server error';
}

app.listen(config.port, () => {
  const mode = config.dryRun ? 'DRY-RUN (no real emails sent)' : 'SMTP';
  console.log(`────────  Email Queue Dispatcher server  ────────`);
  console.log(`  API     : http://localhost:${config.port}/api`);
  console.log(`  Events  : http://localhost:${config.port}/api/events  (SSE)`);
  console.log(`  Mode    : ${mode}`);
  if (mode !== 'DRY-RUN') {
    console.log(`  SMTP    : ${config.smtp.host || '(not configured — use the dashboard Settings panel)'}`);
  }
  console.log(`──────────────────────────────────────────────────`);
});