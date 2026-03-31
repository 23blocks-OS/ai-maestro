/**
 * POST /api/sessions/[id]/stop
 *
 * Gracefully stop the AI program (Claude Code, Codex, etc.) running inside
 * a tmux session by sending Ctrl+C (clear input) then Ctrl+D (EOF/exit).
 *
 * Uses keyboard shortcuts instead of typing "/exit" because:
 * - Ctrl+C reliably clears any partial input on the prompt line
 * - Ctrl+D is the standard EOF signal that exits Claude Code cleanly
 * - Typed text like "/exit" can be misinterpreted as a prompt or skill lookup
 *
 * After this call, the tmux session remains alive (showing a shell prompt)
 * but the AI program is no longer running.
 *
 * The profile panel's Stop button calls this endpoint. It is gated by the
 * `isSafeToCommand` check — the button is only enabled when the agent is
 * at its idle input prompt, ensuring we never interrupt Claude mid-operation.
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
    // Ctrl+C clears any partial input, Ctrl+D sends EOF to exit Claude Code
    execSync(`tmux send-keys -t "${sessionName}" C-c`, { timeout: 5000 })
    execSync(`tmux send-keys -t "${sessionName}" C-d`, { timeout: 5000 })
    return NextResponse.json({ success: true, sessionName })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
