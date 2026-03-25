'use client'

import { useState } from 'react'
import {
  ChevronRight, ChevronDown, Copy, Trash2, Loader2,
  Wand2, Bot, Terminal, Webhook, ScrollText, Server, FileCode, Palette,
} from 'lucide-react'
import type { AgentLocalConfig } from '@/types/agent-local-config'

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type TabId = 'settings' | 'role' | 'plugins' | 'skills' | 'agents' | 'hooks' | 'rules' | 'commands' | 'mcps' | 'outputStyles'

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

export interface AvailableRolePlugin {
  name: string
  version: string
  description: string
  model?: string
  program?: string
}

// ---------------------------------------------------------------------------
// Element type icons + colors (mirrors Settings page ELEMENT_SECTIONS)
// ---------------------------------------------------------------------------

export const ELEMENT_TYPE_META: Record<string, { icon: typeof Wand2; color: string; label: string }> = {
  skill:       { icon: Wand2,      color: 'text-purple-400',  label: 'Skill' },
  agent:       { icon: Bot,        color: 'text-blue-400',    label: 'Agent' },
  command:     { icon: Terminal,    color: 'text-cyan-400',    label: 'Command' },
  hook:        { icon: Webhook,    color: 'text-amber-400',   label: 'Hook' },
  rule:        { icon: ScrollText, color: 'text-orange-400',  label: 'Rule' },
  mcp:         { icon: Server,     color: 'text-green-400',   label: 'MCP Server' },
  lsp:         { icon: FileCode,   color: 'text-teal-400',    label: 'LSP Server' },
  outputStyle: { icon: Palette,    color: 'text-pink-400',    label: 'Output Style' },
}

// ---------------------------------------------------------------------------
// ExpandableElementCard — the core card used across all element tabs
// ---------------------------------------------------------------------------

interface ExpandableCardProps {
  name: string
  elementType: string
  detail?: string
  sourcePlugin?: string
  /** Path to the element file/dir — used for content loading and removal */
  path?: string
  /** Extra metadata rows to show when expanded (key→value) */
  metadata?: Record<string, string>
  /** JSON content to show inline (for hooks, MCP config) */
  jsonContent?: string
  /** Agent ID — needed for remove API calls */
  agentId?: string
  /** Agent working directory — needed for MCP removal */
  workDir?: string
  /** Callback after successful removal */
  onRemoved?: () => void
  /** Callback when plugin badge is clicked — navigates to Plugins tab */
  onPluginClick?: (pluginName: string) => void
  /** Extra content rendered inside the expanded area (e.g. MCP discovery) */
  children?: React.ReactNode
}

export function ExpandableElementCard({
  name, elementType, detail, sourcePlugin, path: elPath,
  metadata, jsonContent, agentId, workDir, onRemoved, onPluginClick, children,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const meta = ELEMENT_TYPE_META[elementType] || { icon: Wand2, color: 'text-gray-500', label: elementType }
  const TypeIcon = meta.icon
  const isStandalone = !sourcePlugin
  const isContentType = ['skill', 'agent', 'rule', 'command', 'outputStyle'].includes(elementType)
  // Hooks and MCP show inline JSON, not file content
  const hasFileContent = isContentType && elPath
  // Standalone elements (not from plugins) can be removed — except hooks (too fragile) and LSP (plugin-only)
  const canRemove = isStandalone && !['hook', 'lsp'].includes(elementType) && agentId

  const toggleExpand = () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    // Lazy-load file content on first expand
    if (nextExpanded && hasFileContent && content === null && !loadingContent) {
      setLoadingContent(true)
      const fetchPath = elementType === 'skill' ? `${elPath}/SKILL.md` : elPath
      fetch(`/api/agents/browse-dir?path=${encodeURIComponent(fetchPath!)}&mode=file`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.content) setContent(data.content) })
        .catch(() => {})
        .finally(() => setLoadingContent(false))
    }
  }

  const handleRemove = async () => {
    if (!agentId) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/remove-element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementType, elementName: name, elementPath: elPath, workDir }),
      })
      if (res.ok) onRemoved?.()
    } catch { /* ignore */ }
    setRemoving(false)
    setConfirmRemove(false)
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isStandalone
        ? 'border-gray-800/60 bg-[#FF0090]/10'
        : 'border-gray-800/60 bg-gray-800/20'
    }`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors hover:bg-gray-800/30 ${expanded ? 'bg-gray-800/40' : ''}`}
        onClick={toggleExpand}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
        }
        <TypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${meta.color}`} />
        <p className="text-xs font-medium text-gray-200 truncate flex-1">{name}</p>
        {sourcePlugin && (
          <span
            className={`text-[9px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded px-1.5 py-0.5 flex-shrink-0 truncate max-w-[120px] ${onPluginClick ? 'cursor-pointer hover:text-blue-300 hover:bg-blue-500/20' : ''}`}
            onClick={onPluginClick ? (e) => { e.stopPropagation(); onPluginClick(sourcePlugin) } : undefined}
            title={onPluginClick ? `Go to ${sourcePlugin} in Plugins tab` : undefined}
          >
            plugin: {sourcePlugin}
          </span>
        )}
        {isStandalone && (
          <span className="text-[9px] text-pink-400/70 bg-pink-500/10 border border-pink-500/15 rounded px-1.5 py-0.5 flex-shrink-0">
            standalone
          </span>
        )}
      </div>

      {/* Detail line (always visible if present) */}
      {detail && !expanded && (
        <div className="px-2.5 pb-1.5 -mt-0.5">
          <p className="text-[10px] text-gray-500 leading-snug line-clamp-1 pl-[30px]">{detail}</p>
        </div>
      )}

      {/* Expanded area */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-800/30 space-y-2">
          {/* Detail / description */}
          {detail && (
            <p className="text-[10px] text-gray-400 leading-snug">{detail}</p>
          )}

          {/* Path */}
          {elPath && (
            <div className="text-[9px] text-gray-600 truncate" title={elPath}>
              Path: {elPath}
            </div>
          )}

          {/* Extra metadata rows */}
          {metadata && Object.keys(metadata).length > 0 && (
            <div className="space-y-0.5">
              {Object.entries(metadata).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px]">
                  <span className="text-gray-600 flex-shrink-0">{k}:</span>
                  <span className="text-gray-400 truncate">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inline JSON content (hooks, MCP) */}
          {jsonContent && (
            <div className="relative">
              <pre className="text-[9px] text-gray-400 p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed bg-gray-900/50 rounded border border-gray-800/30">
                {jsonContent}
              </pre>
              <CopyButton text={jsonContent} />
            </div>
          )}

          {/* Lazy-loaded file content */}
          {hasFileContent && (
            <>
              {loadingContent && (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />
                  <span className="text-[10px] text-gray-600">Loading content…</span>
                </div>
              )}
              {content && (
                <div className="relative">
                  <pre className="text-[9px] text-gray-400 p-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed bg-gray-900/50 rounded border border-gray-800/30">
                    {content}
                  </pre>
                  <CopyButton text={content} />
                </div>
              )}
            </>
          )}

          {/* Extra children (e.g. MCP discovery) */}
          {children}

          {/* Remove button + confirm */}
          {canRemove && !confirmRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmRemove(true) }}
              className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-2.5 h-2.5" />
              Remove
            </button>
          )}
          {confirmRemove && (
            <div className="px-2 py-2 rounded-lg border border-red-500/30 bg-red-500/10">
              <p className="text-[10px] text-red-300 mb-2">
                Remove <span className="font-semibold">{name}</span>? This action is irreversible.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex-1 px-2 py-1 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[10px] font-medium"
                >
                  {removing ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  disabled={removing}
                  autoFocus
                  className="flex-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-[10px] font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy button (positioned at bottom-right of content boxes)
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[8px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors bg-gray-900/80"
    >
      <Copy className="w-2.5 h-2.5" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Simple shared components (kept from before)
// ---------------------------------------------------------------------------

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
