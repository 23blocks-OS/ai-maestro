import { NextResponse } from 'next/server'
import { rm, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

const SESSION_NAME = '_aim-creation-helper'

/**
 * POST /api/agents/creation-helper/cleanup
 * Wipes Haephestos session state so each launch starts fresh:
 * - Kills existing tmux session (so createSession can start a new one)
 * - ~/agents/haephestos/ (working dir — draft TOML, uploads, all session files)
 * - ~/.claude/projects/-Users-...-agents-haephestos/ (Claude conversation cache)
 */
export async function POST() {
  const home = process.env.HOME
  if (!home) {
    return NextResponse.json({ cleaned: false, reason: 'HOME not set' })
  }

  const workDir = join(home, 'agents', 'haephestos')
  // Claude stores per-project state using absolute path with / replaced by -
  // e.g. /Users/foo/agents/haephestos -> -Users-foo-agents-haephestos
  const claudeCacheDir = join(home, '.claude', 'projects', workDir.replace(/\//g, '-'))

  const cleaned: string[] = []

  // Kill stale tmux session so createSession can start fresh
  try {
    await execFileAsync('tmux', ['kill-session', '-t', SESSION_NAME])
    cleaned.push(`tmux:${SESSION_NAME}`)
  } catch {
    // Session didn't exist — that's fine
  }

  // Wipe working directory (contains draft TOML, uploads, and conversation context)
  if (existsSync(workDir)) {
    await rm(workDir, { recursive: true }).catch(() => {})
    cleaned.push('~/agents/haephestos/')
  }
  await mkdir(workDir, { recursive: true }).catch(() => {})

  // Wipe Claude's conversation cache for this project path
  if (existsSync(claudeCacheDir)) {
    await rm(claudeCacheDir, { recursive: true }).catch(() => {})
    cleaned.push('.claude/projects/haephestos-cache/')
  }

  return NextResponse.json({ cleaned: true, files: cleaned })
}
