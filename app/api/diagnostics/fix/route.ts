/**
 * POST /api/diagnostics/fix  { check, key, fix }
 *
 * Runs one fix from the Doctor's closed list on this host, after checking the finding again
 * (docs/SPEC-DOCTOR.md section 6). 409 when the finding is no longer true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDiagnosticFix } from '@/services/diagnostics-service'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const result = await runDiagnosticFix(body)
  return NextResponse.json(result.data, { status: result.status })
}
