import { NextResponse } from 'next/server'
import path from 'path'
import { createSession } from '@/services/sessions-service'

export async function POST(request: Request) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SF-020: Validate session name matches tmux naming constraints
    if (!body.name || typeof body.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(body.name)) {
      return NextResponse.json({ error: 'Session name is required and must match ^[a-zA-Z0-9_-]+$' }, { status: 400 })
    }

    // SF-004: Validate workingDirectory is an absolute path (or ~/... for home-relative) to prevent path traversal
    if (body.workingDirectory && !body.workingDirectory.startsWith('~') && !path.isAbsolute(body.workingDirectory)) {
      return NextResponse.json({ error: 'workingDirectory must be an absolute path' }, { status: 400 })
    }

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
