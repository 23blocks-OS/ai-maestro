import { NextRequest, NextResponse } from 'next/server'
import { registerPeer } from '@/services/hosts-service'

/**
 * POST /api/hosts/register-peer
 *
 * Accept registration from a remote host and add it to local hosts.json.
 */
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await registerPeer(body)
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
}
