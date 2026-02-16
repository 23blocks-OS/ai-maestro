import { NextRequest, NextResponse } from 'next/server'
import { exchangePeers } from '@/services/hosts-service'

/**
 * POST /api/hosts/exchange-peers
 *
 * Exchange known hosts with a peer to achieve mesh connectivity.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()

  const result = await exchangePeers(body)
  return NextResponse.json(result.data, { status: result.status })
}
