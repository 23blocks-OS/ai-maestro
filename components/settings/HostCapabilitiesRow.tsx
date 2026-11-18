'use client'

import { Check, X } from 'lucide-react'
import type { HostCapabilities } from '@/lib/host-capabilities'

/** Short names for the chips; the full meaning and the reason are in each chip's tooltip */
const SHORT: Record<string, string> = {
  meetings: 'Meetings', publicMeetings: 'Public meeting page', lipSyncFace: 'Lip-synced face', agentVoice: 'Agent voice',
  localVoice: 'Local voice', speakingSide: 'Speaking side', heavyWork: 'Heavy work',
}
const FULL: Record<string, string> = {
  meetings: 'Host meetings (room, transcription, agents in the room)', publicMeetings: 'Public meeting page for guests',
  lipSyncFace: "An agent's lip-synced face in meetings", agentVoice: 'Agent voice (speech and hearing)',
  localVoice: 'Local voice models (no cloud)', speakingSide: "Agents' speaking side (Claude Code installed)",
  heavyWork: 'Heavy work (indexing, many agents)',
}

/** What a host can and cannot run (F109), each with its reason */
export default function HostCapabilitiesRow({ caps }: { caps: HostCapabilities | undefined }) {
  if (!caps) return null
  const f = caps.facts
  return (
    <div className="mt-3">
      <div className="text-xs text-gray-500 mb-1.5">
        {f.memoryGB} GB memory · {f.cpus} CPUs{f.diskFreeGB !== null ? ` · ${f.diskFreeGB} GB free on disk` : ''} · {f.platform}/{f.arch}
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="What this host can run">
        {Object.entries(caps.capabilities).map(([name, c]) => (
          <li
            key={name}
            title={`${FULL[name] || name}: ${c.can ? 'yes' : 'no'}, ${c.why}${c.byOperator ? ' (set by the operator)' : ''}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${c.can ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-500/10 border-gray-600/40 text-gray-500'}`}
          >
            {c.can ? <Check className="w-3 h-3" aria-hidden /> : <X className="w-3 h-3" aria-hidden />}
            <span>{SHORT[name] || name}</span>
            <span className="sr-only">{c.can ? 'can run' : 'cannot run'}: {c.why}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
