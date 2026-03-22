/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

// Allowed repository hosting domains — prevents SSRF via file://, internal hosts, etc.
const ALLOWED_REPO_HOSTS = ['github.com', 'gitlab.com']

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    // JSON parse errors are client mistakes — return 400 for those specifically
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
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
    const result = await scanRepo(repoUrl, ref)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        // Fall back to 500 when scanRepo sets error but omits status
        { status: result.status ?? 500 }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // Unexpected runtime errors from scanRepo or elsewhere are server-side failures
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
