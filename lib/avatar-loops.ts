/**
 * Living avatars: short seamless video loops of an agent's portrait, one per
 * state (idle, working, waiting, sleeping). They live in the agent's own
 * directory, so they move with the agent between hosts:
 *
 *   ~/.aimaestro/agents/<id>/avatar/<state>.mp4
 *
 * How they are made is outside the app (backlog F012): locally with
 * LivePortrait (free, a still portrait driven by a sample motion) or with a
 * video model (Veo). The app only plays what is there and falls back to the
 * still or the canvas-animated face (components/AgentFace.tsx) for any state
 * without a loop.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export const AVATAR_STATES = ['idle', 'working', 'waiting', 'sleeping'] as const
export type AvatarState = typeof AVATAR_STATES[number]

const SAFE_ID = /^[A-Za-z0-9_-]+$/

export function avatarDir(agentId: string): string | null {
  if (!SAFE_ID.test(agentId)) return null
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'avatar')
}

/** The states this agent has a loop for. */
export function listAvatarLoops(agentId: string): AvatarState[] {
  const dir = avatarDir(agentId)
  if (!dir) return []
  return AVATAR_STATES.filter(s => {
    try { return fs.statSync(path.join(dir, `${s}.mp4`)).size > 0 } catch { return false }
  })
}

/** Path of one loop, or null (unknown state, bad id, missing file). */
export function avatarLoopPath(agentId: string, state: string): string | null {
  const dir = avatarDir(agentId)
  if (!dir || !(AVATAR_STATES as readonly string[]).includes(state)) return null
  const p = path.join(dir, `${state}.mp4`)
  return fs.existsSync(p) ? p : null
}

/** Parse a single "bytes=start-end" range against a file size. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start = m[1] === '' ? NaN : parseInt(m[1], 10)
  let end = m[2] === '' ? NaN : parseInt(m[2], 10)
  if (isNaN(start)) { // suffix range: last N bytes
    if (isNaN(end)) return null
    start = Math.max(0, size - end)
    end = size - 1
  } else if (isNaN(end) || end >= size) {
    end = size - 1
  }
  if (start > end || start >= size) return null
  return { start, end }
}
