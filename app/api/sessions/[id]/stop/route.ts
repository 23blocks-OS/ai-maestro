/**
 * POST /api/sessions/[id]/stop
 *
 * Gracefully stop the AI program (Claude Code, Codex, etc.) running inside
 * a tmux session by sending the `/exit` command.
 *
 * `/exit` is the standard clean shutdown command recognized by Claude Code.
 * It tells Claude to finish any pending writes, save state, and exit back
 * to the shell prompt. After this call, the tmux session remains alive
 * (showing a shell prompt) but the AI program is no longer running.
 *
 * The profile panel's Stop button calls this endpoint. It is gated by the
 * `isSafeToCommand` check — the button is only enabled when the agent is
 * at its idle input prompt (notificationType === 'idle_prompt'), ensuring
 * we never interrupt Claude mid-operation.
 *
 * **Response:** `{ success: true, sessionName }` on success, or HTTP 500 if
 * the tmux send-keys command fails (e.g. session not found).
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionName } = await params

  try {
    const { execSync } = require('child_process')
    // Send /exit to the tmux session — Claude interprets this as a graceful shutdown
    execSync(`tmux send-keys -t "${sessionName}" '/exit' Enter`, { timeout: 5000 })
    return NextResponse.json({ success: true, sessionName })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
