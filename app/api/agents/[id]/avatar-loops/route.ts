/**
 * GET /api/agents/:id/avatar-loops — which states this agent has a living
 * avatar loop for (lib/avatar-loops.ts).
 */
import { NextResponse } from 'next/server'
import { listAvatarLoops } from '@/lib/avatar-loops'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json({ states: listAvatarLoops(id) }, { headers: { 'Cache-Control': 'max-age=60' } })
}
