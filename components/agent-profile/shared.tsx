'use client'

import type { AgentLocalConfig } from '@/types/agent-local-config'

// Tab definitions
export type TabId = 'settings' | 'role' | 'plugins' | 'skills' | 'agents' | 'hooks' | 'rules' | 'commands' | 'mcps'

export interface TabDef {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  countKey?: keyof AgentLocalConfig
}

export interface AgentInfo {
  name?: string
  title?: 'manager' | 'chief-of-staff' | 'member'
  program?: string
  model?: string
  programArgs?: string
  tags?: string[]
}

// Available role plugin from the marketplace API
export interface AvailableRolePlugin {
  name: string
  version: string
  description: string
  model?: string
  program?: string
}

export function ItemRow({ name, detail, sourcePlugin }: { name: string; detail?: string; sourcePlugin?: string }) {
  return (
    <div className="px-2.5 py-2 rounded-lg border border-gray-700/30 bg-gray-800/20">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-gray-200 truncate flex-1">{name}</p>
        {sourcePlugin && (
          <span className="text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px]">
            plugin: {sourcePlugin}
          </span>
        )}
      </div>
      {detail && (
        <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{detail}</p>
      )}
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[11px] text-gray-500 w-20 flex-shrink-0">{label}</span>
      {value ? (
        <span className="text-xs text-gray-200 truncate">{value}</span>
      ) : (
        <span className="text-xs text-gray-600 italic">(none)</span>
      )}
    </div>
  )
}

export function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{text}</p>
  )
}

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-24 gap-1">
      <p className="text-[11px] text-gray-600 italic">{text}</p>
      {hint && (
        <p className="text-[10px] text-gray-700 text-center px-4 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

export function ListTab<T>({
  items,
  emptyText,
  emptyHint,
  renderItem,
}: {
  items: T[]
  emptyText: string
  emptyHint?: string
  renderItem: (item: T) => React.ReactNode
}) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} hint={emptyHint} />
  }
  return <div className="space-y-1.5">{items.map(renderItem)}</div>
}
