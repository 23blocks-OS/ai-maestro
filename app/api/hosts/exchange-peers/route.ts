import { NextRequest, NextResponse } from 'next/server'
import { exchangePeers } from '@/services/hosts-service'

/**
 * POST /api/hosts/exchange-peers
 *
 * Exchange known hosts with a peer to achieve mesh connectivity.
 */
export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await exchangePeers(body)
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
}
