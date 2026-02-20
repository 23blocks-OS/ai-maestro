import { NextRequest, NextResponse } from 'next/server'
import { registerPeer } from '@/services/hosts-service'

/**
 * POST /api/hosts/register-peer
 *
 * Accept registration from a remote host and add it to local hosts.json.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()

  const result = await registerPeer(body)
  return NextResponse.json(result.data, { status: result.status })
}
