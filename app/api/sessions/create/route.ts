import { NextResponse } from 'next/server'
import { createSession } from '@/services/sessions-service'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = await createSession({
      name: body.name,
      workingDirectory: body.workingDirectory,
      agentId: body.agentId,
      hostId: body.hostId,
      label: body.label,
      avatar: body.avatar,
      programArgs: body.programArgs,
      program: body.program,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to create session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
