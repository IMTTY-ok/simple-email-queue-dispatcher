/**
 * Minimal Server-Sent Events hub.
 * The dispatcher and store publish events here; connected dashboards receive them.
 */

const clients = new Set();

/**
 * Register an SSE response object. Returns a cleanup function.
 */
export function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
  res.on('error', () => clients.delete(res));
  return () => clients.delete(res);
}

/** Number of currently connected dashboards. */
export function clientCount() {
  return clients.size;
}

/**
 * Push an event to every connected dashboard.
 * @param {string} event  e.g. 'email', 'activity', 'stats', 'dispatcher'
 * @param {*} data
 */
export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}