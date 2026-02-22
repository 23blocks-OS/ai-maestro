import { NextRequest, NextResponse } from 'next/server'
import { forwardMessage } from '@/services/messages-service'

// CC-P1-412: Wrap request.json() in try/catch for malformed JSON
export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await forwardMessage(body)
  // NT-002: Use standard if (result.error) pattern instead of ?? which hides errors
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
