/**
 * Install a missing agent program (F072 phase 2)
 *
 * POST /api/tools/install  { tool, hostUrl? }  → 202 { job }
 * GET  /api/tools/install[?hostUrl=]           → { job } (null when none ran since the server started)
 *
 * A closed list: `npm install -g <the tool's verified package>`, see services/program-install-service.ts.
 */
import { NextResponse } from 'next/server'
import { programInstallRequest } from '@/services/program-install-service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const result = await programInstallRequest('GET', new URL(request.url).searchParams.get('hostUrl'))
  return NextResponse.json(result.data, { status: result.status })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const result = await programInstallRequest('POST', typeof body?.hostUrl === 'string' ? body.hostUrl : null, body)
  return NextResponse.json(result.data, { status: result.status })
}
