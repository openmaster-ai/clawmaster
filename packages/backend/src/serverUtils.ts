import type express from 'express'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * HTTP status when openclaw exits non-zero so the UI can tell env vs config vs other failures.
 * - 503: Node version does not satisfy openclaw requirements
 * - 422: openclaw.json (etc.) failed validation (suggest `openclaw doctor --fix`)
 */
export function statusForOpenclawCliError(message: string): number {
  if (/Node\.js\s+v?\d/i.test(message) && /required|current:/i.test(message)) {
    return 503
  }
  if (
    /config\s+invalid/i.test(message) ||
    /invalid\s+config/i.test(message) ||
    /must\s+NOT\s+have\s+additional\s+properties/i.test(message)
  ) {
    return 422
  }
  return 500
}

export function sendOpenclawFailure(res: express.Response, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error)
  res.status(statusForOpenclawCliError(msg)).type('text').send(msg)
}
