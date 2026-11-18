import { createHash } from 'crypto'

// ETag + 304 for JSON the phone app polls (agents list, activity, canvas list).
// The tag is a hash of the body, so a 304 means "byte for byte what you have".
// Weak (W/) because the same body goes out gzip, brotli or plain.
// no-cache: a client may keep the answer but must ask again every time.

export function weakEtag(body: string): string {
  return `W/"${createHash('sha1').update(body).digest('base64url')}"`
}

/** If-None-Match names this tag (weak comparison, RFC 9110 13.1.2), or is `*`. */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  const opaque = (t: string) => t.trim().replace(/^W\//, '')
  return ifNoneMatch.split(',').some(t => t.trim() === '*' || opaque(t) === opaque(etag))
}

/** Status, headers and body (null for 304) for a 200 JSON answer to a GET with this If-None-Match. */
export function etagJson(ifNoneMatch: string | null | undefined, data: unknown) {
  const body = JSON.stringify(data)
  const etag = weakEtag(body)
  const headers: Record<string, string> = { ETag: etag, 'Cache-Control': 'no-cache' }
  if (etagMatches(ifNoneMatch, etag)) return { status: 304, headers, body: null }
  return { status: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body }
}

/** Next route version: a Response that is a 304 when the client already has this JSON. */
export function etagJsonResponse(request: Request, data: unknown): Response {
  const r = etagJson(request.headers.get('if-none-match'), data)
  return new Response(r.body, { status: r.status, headers: r.headers })
}
