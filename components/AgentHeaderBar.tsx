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

export interface AgentHeaderBarProps {
  hostId?: string | null
  /** Display name (label, else name) */
  name: string
  workingDirectory?: string | null
  /** Tailwind classes for the status dot, e.g. "bg-green-500" or "bg-amber-400 animate-pulse" */
  dotClass: string
  /** Tooltip for the dot */
  dotTitle?: string
  /** What the agent is doing, shown after the name (chat: "working…", "ready for input") */
  status?: ReactNode
  /** Small muted detail after the status (chat: "120 messages · 2m ago") */
  detail?: ReactNode
  /** The tab's own tools */
  actions?: ReactNode
  /** The agent's face, alive for its state (components/LiveAvatar.tsx) */
  avatar?: { agentId: string; src?: string | null; hostUrl?: string; state: LiveAvatarState }
}

/** /Users/me/x or /home/me/x → ~/x, so the folder fits */
export function shortenPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~')
}

export default function AgentHeaderBar({ hostId, name, workingDirectory, dotClass, dotTitle, status, detail, actions, avatar }: AgentHeaderBarProps) {
  const host = hostId && hostId !== 'local' ? hostId : 'local'
  return (
    <div className="px-3 md:px-4 py-2 border-b border-gray-700 bg-gray-800 flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {avatar && (
            <LiveAvatar agentId={avatar.agentId} avatar={avatar.src} hostUrl={avatar.hostUrl} state={avatar.state} size={32} alt={name} className="mr-1" />
          )}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} title={dotTitle} />
          <h3 className="font-medium text-gray-400 text-xs md:text-sm truncate flex-shrink-0 max-w-[30%]">{host}</h3>
          <span className="text-gray-600">/</span>
          <h3 className="font-medium text-gray-100 text-sm md:text-base truncate min-w-0">{name}</h3>
          {status && (
            <span className="text-xs text-gray-400 truncate flex-shrink min-w-0">{status}</span>
          )}
          {workingDirectory && (
            <span
              className="hidden lg:flex items-center gap-1 text-xs text-gray-500 font-mono truncate min-w-0"
              title={workingDirectory}
            >
              <Folder className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{shortenPath(workingDirectory)}</span>
            </span>
          )}
          {detail && <span className="hidden xl:inline text-xs text-gray-500 flex-shrink-0">{detail}</span>}
        </div>
        {actions && <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-400 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
