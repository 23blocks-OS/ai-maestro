/**
 * POST /api/sessions/[id]/stop
 *
 * Gracefully stop the AI program running inside a tmux session.
 *
 * Sends Ctrl+C (clear any partial input) then `/exit` as literal text.
 * Chrome testing confirmed: Ctrl+D does NOT exit Claude Code — only /exit works.
 * The `-l` flag on tmux send-keys sends literal characters, avoiding key-name
 * interpretation that could corrupt the command.
 *
 * Fires the `SessionEnd` hook on exit.
 *
 * After this call, the tmux session remains alive (showing a shell prompt)
 * but the AI program is no longer running.
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
    // Ctrl+C clears any partial input, then /exit as literal text exits Claude Code
    // Note: Ctrl+D does NOT exit Claude Code. Only /exit works.
    // The -l flag sends literal text (not key names), Enter is a key name so sent separately.
    execSync(`tmux send-keys -t "${sessionName}" C-c`, { timeout: 5000 })
    execSync(`tmux send-keys -t "${sessionName}" -l '/exit'`, { timeout: 5000 })
    execSync(`tmux send-keys -t "${sessionName}" Enter`, { timeout: 5000 })
    return NextResponse.json({ success: true, sessionName })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
