/** GET /api/agents/[id]/devices/[key]/snapshot: the newest picture from this device. */
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import { latestAgentDeviceSnapshot } from '@/services/agent-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params
  const result = await latestAgentDeviceSnapshot(id, key)
  const file = (result.data as { path?: string } | undefined)?.path
  if (!file) return toResponse(result)
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } })
}
