import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sessions/[id]/stop
 * Sends /exit to a tmux session to gracefully stop the running program.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionName } = await params

  try {
    const { execSync } = require('child_process')
    // Send /exit to the tmux session
    execSync(`tmux send-keys -t "${sessionName}" '/exit' Enter`, { timeout: 5000 })
    return NextResponse.json({ success: true, sessionName })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
