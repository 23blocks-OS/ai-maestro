import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const SESSION_NAME = '_aim-creation-helper'

/**
 * POST /api/agents/creation-helper/clear-banner
 *
 * Sends a short greeting prompt to Haephestos to push the Claude startup
 * banner off the visible viewport. The banner is part of Claude Code's TUI
 * and can only be scrolled away by generating conversation output.
 */
export async function POST() {
  try {
    // Send a minimal greeting — Haephestos will respond with a short welcome,
    // which generates enough output to push the startup banner off-screen.
    await execFileAsync('tmux', [
      'send-keys', '-t', SESSION_NAME,
      'hi',
      'Enter'
    ])
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
