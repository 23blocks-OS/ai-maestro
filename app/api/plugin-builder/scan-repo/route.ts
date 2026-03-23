/**
 * Plugin Builder - Repo Scanner API
 *
 * POST /api/plugin-builder/scan-repo - Scan a git repo for skills
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { scanRepo } from '@/services/plugin-builder-service'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    // request.json() throws a SyntaxError when the body is not valid JSON
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  try {
    // Reject non-object bodies (null, primitives, arrays) before property access;
    // accessing properties on those values would silently yield undefined or throw.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid request body: expected object' },
        { status: 400 }
      )
    }
    const parsedBody = body as Record<string, unknown>

    if (!parsedBody.url || typeof parsedBody.url !== 'string') {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      )
    }

    // Trim whitespace before URL validation so leading/trailing spaces don't bypass the check.
    const url = parsedBody.url.trim()

    // Enforce strict GitHub HTTPS URL format to prevent SSRF via file://, http://localhost, etc.
    if (!/^https:\/\/github\.com\/[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+$/.test(url)) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository URL' },
        { status: 400 }
      )
    }

    // Validate that ref, when provided, is a non-empty string; fall back to 'main'
    const ref =
      parsedBody.ref && typeof parsedBody.ref === 'string' && parsedBody.ref.trim()
        ? parsedBody.ref.trim()
        : 'main'

    const result = await scanRepo(url, ref)

    if (result.error) {
      // result.error is typed string in ServiceResult — pass it through directly.
      // result.status is always present in ServiceResult (non-optional field).
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
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
    // Unexpected runtime error from scanRepo or elsewhere — this is a server fault
    console.error('Error scanning repo:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
