/**
 * API Route Helpers
 *
 * Shared utilities for Next.js API route handlers.
 * Converts ServiceResult<T> to NextResponse with proper error formatting.
 */

import { NextResponse } from 'next/server'
import type { ServiceResult } from '@/services/service-errors'

/**
 * Convert a ServiceResult into a NextResponse.
 *
 * result.data contains either the success payload or a ServiceError.
 * The status code is always taken from result.status.
 */
export function toResponse<T>(result: ServiceResult<T>): NextResponse {
  const opts: ResponseInit & { headers?: Record<string, string> } = {
    status: result.status,
  }
  if (result.headers) {
    opts.headers = result.headers
  }

  if (result.data !== undefined) {
    return NextResponse.json(result.data, opts)
  }

  // Defensive fallback — should not happen after migration
  return NextResponse.json(
    { error: 'internal_error', message: 'Unknown error' },
    { status: result.status >= 400 ? result.status : 500 }
  )
}
