'use client'

/**
 * Folder and AMP address on one quiet line: the facts AgentHeaderBar shows under
 * the name, for the mobile chat, which has no header bar of its own. Each part is
 * left out when unknown, and the whole line when both are.
 */

import { Folder } from 'lucide-react'
import { shortenPath } from './AgentHeaderBar'

export default function AgentIdentityLine({ workingDirectory, address }: { workingDirectory?: string | null; address?: string | null }) {
  if (!workingDirectory && !address) return null
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight text-gray-400" data-testid="agent-identity-line">
      {workingDirectory && (
        <span className="flex items-center gap-1 font-mono truncate min-w-0" title={workingDirectory}>
          <Folder className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{shortenPath(workingDirectory)}</span>
        </span>
      )}
      {workingDirectory && address && <span className="text-gray-600">·</span>}
      {address && <span className="font-mono truncate min-w-0 text-gray-500" title={address}>{address}</span>}
    </div>
  )
}
