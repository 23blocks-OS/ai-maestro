import { NextRequest, NextResponse } from 'next/server'
import { notifyGroupSubscribers } from '@/services/groups-service'

// POST /api/groups/[id]/notify - Notify all group subscribers
// Body: { message: string, priority?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, priority } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const result = await notifyGroupSubscribers(id, message, priority)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
