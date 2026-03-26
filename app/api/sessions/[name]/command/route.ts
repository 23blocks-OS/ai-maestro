import { NextRequest, NextResponse } from 'next/server'
import { sendCommand } from '@/services/sessions-service'

export const dynamic = 'force-dynamic'

// POST /api/sessions/{name}/command — Send a command to a tmux session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { command, addNewline, requireIdle } = body
  const result = await sendCommand(name, command, {
    requireIdle: requireIdle ?? false,
    addNewline: addNewline ?? true,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
