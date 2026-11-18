import type { StatusSnapshot } from '@/lib/transcript-snapshot'
import { formatLimits } from '@/lib/status-format'

/** On an agent card: the plan usage limit once it passes 80%, so a crew about to pause together shows before it does */
export default function UsageLimitBadge({ snapshot }: { snapshot?: StatusSnapshot | null }) {
  const l = formatLimits(snapshot?.limits)
  if (!l || l.max < 80) return null
  return (
    <span title={l.title} data-testid="usage-limit" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${l.max >= 95 ? 'bg-red-500/80 text-white' : 'bg-amber-500/20 text-amber-300'}`}>
      {l.max}%
    </span>
  )
}
