/**
 * In-memory presence tracking ("số người online").
 *
 * The client pings /api/presence/ping every 30s with a random per-tab session
 * id; a session counts as online while its last ping is younger than the TTL.
 * Deliberately RAM-only — presence is throwaway data and must not cost a
 * Supabase round trip on every heartbeat.
 *
 * Note: the count is per process. It is accurate on the long-lived Render
 * server; on stateless Netlify functions each cold start begins from zero.
 */

/** A session is considered online for this long after its last heartbeat. */
export const HEARTBEAT_TTL_MS = 60_000;

/** Hard cap so a flood of session ids cannot grow the map without bound. */
export const MAX_TRACKED_SESSIONS = 10_000;

/** sessionId -> last heartbeat timestamp (ms). Insertion order = recency. */
const sessions = new Map<string, number>();

/**
 * Drops every session whose last heartbeat is older than the TTL.
 *
 * recordHeartbeat re-inserts on every ping, so iteration order is oldest-first
 * and the scan can stop at the first session still inside the window.
 */
function pruneExpired(now: number): void {
  for (const [id, lastSeen] of sessions) {
    if (now - lastSeen < HEARTBEAT_TTL_MS) break;
    sessions.delete(id);
  }
}

/** Records a heartbeat for `sessionId` and returns the current online count. */
export function recordHeartbeat(sessionId: string): number {
  const now = Date.now();
  pruneExpired(now);

  // Re-inserting keeps the map ordered oldest-first, so eviction drops the
  // least recently seen session when the cap is reached.
  sessions.delete(sessionId);
  while (sessions.size >= MAX_TRACKED_SESSIONS) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
  sessions.set(sessionId, now);

  return sessions.size;
}

/** Number of sessions seen within the TTL window. */
export function countOnline(): number {
  pruneExpired(Date.now());
  return sessions.size;
}
