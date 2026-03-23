/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

// Only GitHub HTTPS URLs are accepted to prevent SSRF attacks against internal hosts.
const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9._-]+$/

// Allowed repository hosts — restricts scan-repo to prevent SSRF
const ALLOWED_REPO_HOSTS = ['github.com', 'gitlab.com']

export async function POST(request: NextRequest) {
  // SF-004: Separate JSON parsing from service call so service errors
  // are not misattributed as "Invalid request body" (400)
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch (error) {
    // JSON parse errors from request.json() are SyntaxErrors — return 400
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }

  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  // SF-006: Validate body.ref is undefined or a string before passing to service
  if (body.ref !== undefined && typeof body.ref !== 'string') {
    return NextResponse.json(
      { error: 'ref must be a string if provided' },
      { status: 400 }
    )
  }

  try {
    const result = await scanRepo(body.url as string, (body.ref as string) || 'main')

    if (result.error) {
      // Validate the status code is a proper HTTP status before using it
      const statusCode =
        typeof result.status === 'number' && result.status >= 100 && result.status < 600
          ? result.status
          : 500
      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    // Unexpected server-side error — not a client input problem
    console.error('Error scanning repo:', error)
    // All unexpected service errors are server-side failures — return 500
    return NextResponse.json(
      { error: 'An unexpected server error occurred' },
      { status: 500 }
    )
  }

  // body.url must be a non-empty string
  if (!body || typeof (body as Record<string, unknown>).url !== 'string' || !(body as Record<string, unknown>).url) {
    return NextResponse.json(
      { error: 'Repository URL is required' },
      { status: 400 }
    )
  }

  const typedBody = body as Record<string, unknown>
  const repoUrl = typedBody.url as string

  // Validate URL format and restrict to allowed hosts to prevent SSRF
  let parsedUrl: URL
  try {
    parsedUrl = new URL(repoUrl)
  } catch {
    return NextResponse.json(
      { error: 'Invalid repository URL' },
      { status: 400 }
    )
  }
  // hostname strips the port, host includes it — exact match only; subdomain wildcards
  // would allow SSRF via arbitrary-depth subdomains on the allowed domains
  if (!ALLOWED_REPO_HOSTS.some(allowed => parsedUrl.hostname === allowed)) {
    return NextResponse.json(
      { error: 'Repository URL must be from github.com or gitlab.com' },
      { status: 400 }
    )
  }

  // Validate body.ref: must be a string if provided; ignore non-string truthy values
  const ref = typedBody.ref !== undefined && typeof typedBody.ref !== 'string'
    ? null // non-string ref is an invalid client input
    : (typedBody.ref as string | undefined) || 'main'

  if (ref === null) {
    return NextResponse.json(
      { error: 'ref must be a string' },
      { status: 400 }
    )
  }

  try {
    const result = await scanRepo(repoUrl, ref ?? undefined)

    if (result.error) {
      // Provide a 500 fallback in case the service omits status on error
      return NextResponse.json(
        { error: result.error },
        // Fall back to 500 when scanRepo sets error but omits status
        { status: result.status ?? 500 }
      )
    }
    if (result.data === undefined) {
      // Guard against a ServiceResult that has neither error nor data — this would
      // mean a bug in the service layer; surface it as a server error rather than
      // silently returning an empty 200 body.
      console.error('scanRepo returned a successful result with no data')
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // Unexpected runtime errors from scanRepo or elsewhere are server-side failures
    console.error('Error scanning repo:', error)
    // SyntaxError is thrown by request.json() when the body is not valid JSON
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
