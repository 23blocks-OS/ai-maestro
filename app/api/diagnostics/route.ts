/**
 * Diagnostics Endpoint
 *
 * GET /api/diagnostics[?fresh=1]
 *
 * Runs system self-diagnostics and returns a full report: host, install and per-agent checks
 * (docs/SPEC-DOCTOR.md). fresh=1 skips the finished-report cache.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDiagnostics } from '@/services/diagnostics-service'

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get('fresh') === '1'
  const result = await runDiagnostics(Date.now(), { fresh })
  return NextResponse.json(result.data, { status: result.status })
}
