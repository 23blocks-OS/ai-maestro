/**
 * Diagnostics Endpoint
 *
 * GET /api/diagnostics
 *
 * Runs system self-diagnostics and returns a full report.
 * Checks tmux, node-pty, agent registry, remote hosts, Node.js version, disk space.
 */

import { NextResponse } from 'next/server'
import { runDiagnostics } from '@/services/diagnostics-service'

export async function GET() {
  const result = await runDiagnostics()
  return NextResponse.json(result.data, { status: result.status })
}
