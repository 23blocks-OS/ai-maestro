import { NextRequest, NextResponse } from 'next/server'
import { forwardMessage } from '@/services/messages-service'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await forwardMessage(body)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
