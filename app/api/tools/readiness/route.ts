/**
 * Tool readiness
 *
 * GET /api/tools/readiness[?hostUrl=<a configured host>]
 *
 * Which agent tools can start on a host (found on an agent shell's PATH, runs, and for Pi a new enough Node).
 * Sign-in is not checked: every tool asks for it itself.
 */
import { NextResponse } from 'next/server'
import { toolReadinessRequest } from '@/services/tool-readiness-service'

export async function GET(request: Request) {
  const hostUrl = new URL(request.url).searchParams.get('hostUrl')
  const result = await toolReadinessRequest(hostUrl)
  return NextResponse.json(result.data, { status: result.status })
}
