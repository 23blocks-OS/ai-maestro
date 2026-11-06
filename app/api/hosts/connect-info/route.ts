import { NextResponse } from 'next/server'
import { getConnectInfo } from '@/services/hosts-service'

export const dynamic = 'force-dynamic'

/** GET /api/hosts/connect-info: where a phone can find this computer, and the link for the QR code. */
export async function GET() {
  const result = await getConnectInfo()
  return NextResponse.json(result.data, { status: result.status })
}
