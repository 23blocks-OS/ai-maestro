/**
 * Raw Materials State API
 *
 * POST /api/agents/creation-helper/raw-materials
 *   Writes the current Raw Materials panel state to ~/agents/haephestos/raw-materials-state.json
 *   so the Haephestos agent can read it and be aware of user choices.
 *
 * GET /api/agents/creation-helper/raw-materials
 *   Reads the current raw materials state (for Haephestos or debugging).
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export const dynamic = 'force-dynamic'

const STATE_DIR = join(homedir(), 'agents', 'haephestos')
const STATE_FILE = join(STATE_DIR, 'raw-materials-state.json')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const state = {
      personaName: body.personaName || '',
      avatarUrl: body.avatarUrl || '',
      avatarIndex: body.avatarIndex ?? -1,
      uploadedFiles: body.uploadedFiles || [],
      updatedAt: new Date().toISOString(),
    }

    await mkdir(STATE_DIR, { recursive: true })
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write state'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const content = await readFile(STATE_FILE, 'utf-8')
    const state = JSON.parse(content)
    return NextResponse.json(state)
  } catch (error) {
    // Return default state only when the file does not exist yet
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({
        personaName: '',
        avatarUrl: '',
        avatarIndex: -1,
        uploadedFiles: [],
        updatedAt: '',
      })
    }
    // All other errors (permission denied, malformed JSON, etc.) are real failures
    const message = error instanceof Error ? error.message : 'Failed to read state'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
