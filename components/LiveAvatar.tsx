'use client'

/**
 * An agent's face that shows what the agent is doing.
 *
 *   1. A living-avatar loop for the current state, when the agent has one
 *      (lib/avatar-loops.ts: a short video of its portrait breathing,
 *      blinking, glancing down at work, looking up waiting for you).
 *   2. Otherwise the still portrait, kept alive with CSS: a slow breath when
 *      idle, a quicker one while working, a ring for the state, dimmed and
 *      still when asleep.
 *
 * Loops are looked up once per agent and host, then cached for the session.
 */

import { useEffect, useState } from 'react'

export type LiveAvatarState = 'idle' | 'working' | 'waiting' | 'sleeping'

export interface LiveAvatarProps {
  agentId: string
  /** Still image URL (or emoji, shown as text) */
  avatar?: string | null
  /** Where the agent's API lives, for agents on other hosts ('' = this host) */
  hostUrl?: string
  state: LiveAvatarState
  /** Pixel size (square). Ignored with `fill`. */
  size?: number
  /** Fill the parent (a tile or rounded square that sets its own size and clipping) */
  fill?: boolean
  /** Clip to a circle (default). Off when the parent already clips. */
  rounded?: boolean
  /** Ring colour for the state (default: on) */
  ring?: boolean
  className?: string
  alt?: string
  /** The still image failed to load (the caller can show initials instead) */
  onImageError?: () => void
}

const loopCache = new Map<string, Promise<string[]>>()

function loopsFor(agentId: string, hostUrl: string): Promise<string[]> {
  const key = `${hostUrl}|${agentId}`
  let p = loopCache.get(key)
  if (!p) {
    p = fetch(`${hostUrl}/api/agents/${encodeURIComponent(agentId)}/avatar-loops`)
      .then(r => (r.ok ? r.json() : { states: [] }))
      .then(d => (Array.isArray(d?.states) ? d.states : []))
      .catch(() => [])
    loopCache.set(key, p)
  }
  return p
}

// Same colours as the sidebar's status dot next to it: green = active,
// amber = waiting for input
const RING: Record<LiveAvatarState, string> = {
  idle: 'ring-emerald-500/25',
  working: 'ring-emerald-400/80 live-avatar-ring-pulse',
  waiting: 'ring-amber-400/80',
  sleeping: 'ring-gray-600/30',
}

export default function LiveAvatar({ agentId, avatar, hostUrl = '', state, size = 40, fill = false, rounded = true, ring = true, className = '', alt, onImageError }: LiveAvatarProps) {
  const [loops, setLoops] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    loopsFor(agentId, hostUrl).then(s => { if (alive) setLoops(s) })
    return () => { alive = false }
  }, [agentId, hostUrl])

  const isImage = !!avatar && (avatar.startsWith('http') || avatar.startsWith('/'))
  const src = isImage ? avatar : null
  const hasLoop = loops.includes(state)
  const frame = `relative overflow-hidden flex-shrink-0 ${rounded ? 'rounded-full' : ''} ${fill ? 'w-full h-full' : ''} ${ring ? `ring-2 ${RING[state]}` : ''} ${className}`
  const box = fill ? undefined : { width: size, height: size }

  if (hasLoop) {
    return (
      <div className={frame} style={box} title={alt}>
        <video
          key={state}
          src={`${hostUrl}/api/agents/${encodeURIComponent(agentId)}/avatar-loops/${state}`}
          poster={isImage ? src || undefined : undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover live-avatar-fade"
          aria-label={alt}
        />
      </div>
    )
  }

  if (!isImage) {
    return (
      <div className={`${frame} bg-slate-700 flex items-center justify-center`} style={box} title={alt}>
        <span style={{ fontSize: fill ? '2.5em' : size * 0.55 }}>{avatar || '🤖'}</span>
      </div>
    )
  }

  const motion = state === 'working' ? 'live-avatar-work' : state === 'sleeping' ? 'live-avatar-sleep' : 'live-avatar-breathe'
  return (
    <div className={frame} style={box} title={alt}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || undefined} alt={alt || ''} className={`w-full h-full object-cover ${motion}`} onError={onImageError} />
    </div>
  )
}

/** Sidebar/session activity → avatar state */
export function avatarStateFrom(opts: { online: boolean; hibernated?: boolean; activity?: 'active' | 'idle' | 'waiting' | string | null }): LiveAvatarState {
  if (!opts.online) return 'sleeping'
  if (opts.activity === 'active') return 'working'
  if (opts.activity === 'waiting') return 'waiting'
  return 'idle'
}

/** An agent's avatar state from the agent itself, when a view has no activity feed */
export function agentAvatarState(agent: { session?: { status?: string } | null; sessions?: Array<{ status?: string }> | null }, activity?: string | null): LiveAvatarState {
  const online = agent.session?.status === 'online' || agent.sessions?.[0]?.status === 'online'
  return avatarStateFrom({ online, activity })
}
