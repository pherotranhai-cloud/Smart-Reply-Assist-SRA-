import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Shared guard for /api/admin/*.
 *
 * These routes were open to anyone who knew the URL, and /admin/responses
 * returns real user input and output text out of app_logs. The client used to
 * "protect" them by comparing a typed key against VITE_ADMIN_SECRET_KEY, which
 * — being a VITE_ variable — was compiled into every shipped bundle, so it
 * gated the dashboard UI and nothing else.
 *
 * The secret now lives only on the server as ADMIN_API_KEY (no VITE_ prefix, so
 * it can never reach a bundle) and the client sends whatever the user typed in
 * the x-admin-key header for the server to judge.
 *
 * Fail closed: with ADMIN_API_KEY unset every request is rejected. An unset
 * secret is a misconfigured deploy, and the alternative — serving the data to
 * anyone until someone remembers to set it — is the bug this replaces.
 *
 * Both hosts mount this: server.ts (Render) and netlify/functions/api.ts.
 */

export const ADMIN_KEY_HEADER = 'x-admin-key';

/** Length-independent compare, so a wrong key leaks nothing through timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, so compare lengths separately.
  // The length of the configured secret is not itself a useful secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True once ADMIN_API_KEY is configured; false means every request is refused. */
export function isAdminAuthConfigured(): boolean {
  return !!process.env.ADMIN_API_KEY;
}

/**
 * Logs the fail-closed state once at startup rather than per request, so a
 * misconfigured deploy is visible without flooding the log.
 */
export function warnIfAdminAuthUnconfigured(context: string): void {
  if (!isAdminAuthConfigured()) {
    console.warn(
      `[adminAuth] ADMIN_API_KEY is not set (${context}). /api/admin/* will reject every request.`
    );
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(401).json({ error: 'Admin access is not configured on this server.' });
  }

  const header = req.get(ADMIN_KEY_HEADER);
  if (!header || !secretsMatch(header, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}
