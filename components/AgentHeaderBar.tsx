'use client'

/**
 * The header every agent tab shares: which agent this is, where it runs, what
 * it is doing. The terminal always showed "host / agent"; the chat replaced the
 * name with its activity ("Agent is working…"), so in the chat you could lose
 * track of which agent you were talking to unless the sidebar was open. Both
 * tabs now use this bar; each tab puts its own tools on the right.
 */

import type { ReactNode } from 'react'
import { Folder } from 'lucide-react'
import LiveAvatar, { type LiveAvatarState } from './LiveAvatar'
import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'

export interface AgentHeaderBarProps {
  hostId?: string | null
  /** Show the host: only for an agent on another machine ("local" on every agent says nothing) */
  remote?: boolean
  /** Display name (label, else name) */
  name: string
  workingDirectory?: string | null
  /** The agent's state: colours the dot and the header's bottom edge */
  presence: AgentPresence
  /** What it is doing, next to the name ("Working · Bash · yarn test"); defaults to the state label */
  status?: ReactNode
  /** The tab's own tools (keep to the few that are used every time) */
  actions?: ReactNode
  /** The agent's face, alive for its state (components/LiveAvatar.tsx) */
  avatar?: { agentId: string; src?: string | null; hostUrl?: string; state: LiveAvatarState }
}

/** /Users/me/x or /home/me/x → ~/x, so the folder fits */
export function shortenPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~')
}

/**
 * Who, what it is doing, where; then the tab's tools. Everything else was
 * removed on purpose (v0.45.4): message counts, "time ago", terminal size and
 * buffer lines, scroll hints, a Refresh for a live view, and "local" as a host.
 * The bottom edge carries the state colour, so the state reads from across the
 * room. Same height as before: the 32 px avatar sets it.
 */
export default function AgentHeaderBar({ hostId, remote = false, name, workingDirectory, presence, status, actions, avatar }: AgentHeaderBarProps) {
  const style = PRESENCE_STYLE[presence]
  const showHost = remote && hostId && hostId !== 'local'
  return (
    <div className={`px-3 md:px-4 py-2 bg-gray-800 border-b-2 ${style.line} flex-shrink-0`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {avatar && (
            <LiveAvatar agentId={avatar.agentId} avatar={avatar.src} hostUrl={avatar.hostUrl} state={avatar.state} size={32} alt={name} />
          )}
          <div className="flex flex-col min-w-0 justify-center">
            <div className="flex items-center gap-2 min-w-0 leading-tight">
              <h3 className="font-semibold text-gray-50 text-[15px] leading-tight truncate min-w-0">{name}</h3>
              <span className="flex items-center gap-1.5 flex-shrink min-w-0" title={style.title}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                <span className={`text-xs leading-tight truncate min-w-0 ${style.text}`}>{status ?? style.label}</span>
              </span>
            </div>
            {(showHost || workingDirectory) && (
              <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight text-gray-400">
                {showHost && <span className="truncate flex-shrink-0 max-w-[45%]">{hostId}</span>}
                {showHost && workingDirectory && <span className="text-gray-600">·</span>}
                {workingDirectory && (
                  <span className="flex items-center gap-1 font-mono truncate min-w-0" title={workingDirectory}>
                    <Folder className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{shortenPath(workingDirectory)}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-1.5 text-xs text-gray-300 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
