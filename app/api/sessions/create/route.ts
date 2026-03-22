import { NextResponse } from 'next/server'
import path from 'path'
import { createSession } from '@/services/sessions-service'

interface CreateSessionRequestBody {
  name: string
  workingDirectory?: string
  agentId?: string
  hostId?: string
  label?: string
  avatar?: string
  programArgs?: string
  program?: string
}

export async function POST(request: Request) {
  try {
    let body: CreateSessionRequestBody
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SF-020: Validate session name matches tmux naming constraints
    if (!body.name || typeof body.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(body.name)) {
      return NextResponse.json({ error: 'Session name is required and must match ^[a-zA-Z0-9_-]+$' }, { status: 400 })
    }

    // SF-004: Validate workingDirectory is an absolute path (or ~/... for home-relative) to prevent path traversal
    // Check typeof first so that non-string values (number, object, null) are rejected before calling string methods
    if (body.workingDirectory !== undefined) {
      if (typeof body.workingDirectory !== 'string' || (!body.workingDirectory.startsWith('~') && !path.isAbsolute(body.workingDirectory))) {
        return NextResponse.json({ error: 'workingDirectory must be an absolute path or start with ~' }, { status: 400 })
      }
    }

    // Validate that all optional string fields are actually strings when provided,
    // since request.json() is untyped at runtime and callers may send wrong types
    if (body.agentId !== undefined && typeof body.agentId !== 'string') {
      return NextResponse.json({ error: 'agentId must be a string' }, { status: 400 })
    }
    if (body.hostId !== undefined && typeof body.hostId !== 'string') {
      return NextResponse.json({ error: 'hostId must be a string' }, { status: 400 })
    }
    if (body.label !== undefined && typeof body.label !== 'string') {
      return NextResponse.json({ error: 'label must be a string' }, { status: 400 })
    }
    if (body.avatar !== undefined && typeof body.avatar !== 'string') {
      return NextResponse.json({ error: 'avatar must be a string' }, { status: 400 })
    }
    if (body.programArgs !== undefined && typeof body.programArgs !== 'string') {
      return NextResponse.json({ error: 'programArgs must be a string' }, { status: 400 })
    }
    if (body.program !== undefined && typeof body.program !== 'string') {
      return NextResponse.json({ error: 'program must be a string' }, { status: 400 })
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
