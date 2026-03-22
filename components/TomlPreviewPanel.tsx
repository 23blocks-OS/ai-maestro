'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  RefreshCw, X, Clipboard, Check, ChevronDown, ChevronRight,
  Wrench, Puzzle, Server, ScrollText, Cog, Code2, FolderOpen,
  Cpu, Shield, Zap, BookOpen, Terminal, Layers, FileCode,
  GitBranch, Users, Command, Webhook,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TomlPreviewPanelProps {
  tomlPath: string
  onClose?: () => void
  onInsertToPrompt?: (text: string) => void
}

interface AgentProfile {
  agent: Record<string, string>
  requirements: { files: string[]; project_type?: string; tech_stack: string[]; extra: Record<string, string> }
  dependencies: { plugins: string[]; skills: string[]; mcp_servers: string[]; tools: string[]; extra: Record<string, string> }
  skills: { primary: string[]; secondary: string[]; specialized: string[]; excluded: Record<string, string> }
  agents: { recommended: string[] }
  commands: { recommended: string[] }
  rules: { recommended: string[] }
  mcp: { recommended: string[] }
  hooks: { recommended: string[] }
  lsp: { recommended: string[] }
}

type BadgeKind =
  | 'primary-skill'
  | 'secondary-skill'
  | 'specialized-skill'
  | 'dep-plugin'
  | 'dep-skill'
  | 'dep-mcp'
  | 'dep-tool'
  | 'rule'
  | 'agent'
  | 'command'
  | 'mcp-server'
  | 'hook'
  | 'lsp'
  | 'tech'
  | 'excluded'

// ---------------------------------------------------------------------------
// Haephestos color palette (from avatar: crimson robot, amber eyes, forge)
// ---------------------------------------------------------------------------

const P = {
  // Backgrounds
  panelBg: '#0e0a0a',
  cardBg: '#161010',
  cardBorder: '#2a1818',
  // Dividers — fire-like gradient
  dividerLeft: '#8a2200',
  dividerMid: '#c85a10',
  dividerRight: '#4a1800',
  // Section headers
  gold: '#d4a530',
  goldDim: '#8a6c20',
  // Text
  text: '#dcd4d4',
  textSec: '#9c8888',
  textMuted: '#5c4c4c',
  // Badge palettes per kind
  badge: {
    'primary-skill':     { bg: '#2e1212', border: '#5c2222', text: '#e4a4a4', label: 'Primary Skill' },
    'secondary-skill':   { bg: '#241c0e', border: '#4e3818', text: '#d0b470', label: 'Secondary Skill' },
    'specialized-skill': { bg: '#0e1424', border: '#1c2c4c', text: '#88acc8', label: 'Specialized Skill' },
    'excluded':          { bg: '#1a1010', border: '#302020', text: '#887070', label: 'Excluded Skill' },
    'dep-plugin':        { bg: '#0c1818', border: '#183838', text: '#70b8b8', label: 'Plugin' },
    'dep-skill':         { bg: '#0e180e', border: '#1a3a1c', text: '#70b878', label: 'Built-in Skill' },
    'dep-mcp':           { bg: '#1a0e1e', border: '#3a1c42', text: '#b888c8', label: 'MCP Server' },
    'dep-tool':          { bg: '#18140c', border: '#38300c', text: '#c8b870', label: 'Tool' },
    'rule':              { bg: '#141010', border: '#281c1c', text: '#b0a0a0', label: 'Rule' },
    'agent':             { bg: '#10141e', border: '#1c2838', text: '#88a8d0', label: 'Sub-Agent' },
    'command':           { bg: '#18100c', border: '#382818', text: '#d0a880', label: 'Command' },
    'mcp-server':        { bg: '#1a0e1e', border: '#3a1c42', text: '#b888c8', label: 'MCP Server' },
    'hook':              { bg: '#0e1414', border: '#1c2c2c', text: '#80b0b0', label: 'Hook' },
    'lsp':               { bg: '#141018', border: '#281c38', text: '#a888c0', label: 'LSP Server' },
    'tech':              { bg: '#181810', border: '#303018', text: '#b8b880', label: 'Tech' },
  } as Record<BadgeKind, { bg: string; border: string; text: string; label: string }>,
} as const

// ---------------------------------------------------------------------------
// TOML syntax highlighter — produces colored spans for the raw TOML view
// ---------------------------------------------------------------------------

const TOML_COLORS = {
  section: P.gold,       // [section.name]
  key: '#d0a880',        // key =
  string: '#a4c888',     // "value"
  number: '#88b8d0',     // 42, 3.14
  boolean: '#c888d0',    // true, false
  comment: '#5c4c4c',    // # comment
  bracket: '#887060',    // [ ] in arrays
  equals: '#6c5c5c',     // =
  punct: '#5c4c4c',      // commas
}

function highlightToml(source: string): React.ReactNode[] {
  return source.split('\n').map((line, i) => {
    const trimmed = line.trim()

    // Comment line
    if (trimmed.startsWith('#')) {
      return <span key={i}><span style={{ color: TOML_COLORS.comment }}>{line}</span>{'\n'}</span>
    }

    // Section header [name] or [[name]]
    if (/^\[{1,2}[^\]]+\]{1,2}\s*(#.*)?$/.test(trimmed)) {
      const commentIdx = trimmed.indexOf('#', trimmed.lastIndexOf(']'))
      if (commentIdx > 0) {
        return (
          <span key={i}>
            <span style={{ color: TOML_COLORS.section, fontWeight: 700 }}>{line.slice(0, line.indexOf('#', line.lastIndexOf(']')))}</span>
            <span style={{ color: TOML_COLORS.comment }}>{line.slice(line.indexOf('#', line.lastIndexOf(']')))}</span>
            {'\n'}
          </span>
        )
      }
      return <span key={i}><span style={{ color: TOML_COLORS.section, fontWeight: 700 }}>{line}</span>{'\n'}</span>
    }

    // Key = value line
    const eqMatch = line.match(/^(\s*)([\w.-]+)(\s*=\s*)(.*)$/)
    if (eqMatch) {
      const [, indent, key, eq, rest] = eqMatch
      const valueParts = highlightTomlValue(rest)
      return (
        <span key={i}>
          {indent}
          <span style={{ color: TOML_COLORS.key }}>{key}</span>
          <span style={{ color: TOML_COLORS.equals }}>{eq}</span>
          {valueParts}
          {'\n'}
        </span>
      )
    }

    // Continuation or plain text
    return <span key={i}>{line}{'\n'}</span>
  })
}

function highlightTomlValue(value: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = value
  let idx = 0

  while (remaining.length > 0) {
    // Inline comment
    const commentMatch = remaining.match(/^(\s*)(#.*)$/)
    if (commentMatch) {
      parts.push(commentMatch[1])
      parts.push(<span key={`c${idx++}`} style={{ color: TOML_COLORS.comment }}>{commentMatch[2]}</span>)
      break
    }
    // String "..."
    const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/)
    if (strMatch) {
      parts.push(<span key={`s${idx++}`} style={{ color: TOML_COLORS.string }}>{strMatch[1]}</span>)
      remaining = remaining.slice(strMatch[1].length)
      continue
    }
    // Boolean
    const boolMatch = remaining.match(/^(true|false)\b/)
    if (boolMatch) {
      parts.push(<span key={`b${idx++}`} style={{ color: TOML_COLORS.boolean }}>{boolMatch[1]}</span>)
      remaining = remaining.slice(boolMatch[1].length)
      continue
    }
    // Number
    const numMatch = remaining.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)
    if (numMatch) {
      parts.push(<span key={`n${idx++}`} style={{ color: TOML_COLORS.number }}>{numMatch[1]}</span>)
      remaining = remaining.slice(numMatch[1].length)
      continue
    }
    // Brackets
    if (remaining[0] === '[' || remaining[0] === ']') {
      parts.push(<span key={`br${idx++}`} style={{ color: TOML_COLORS.bracket }}>{remaining[0]}</span>)
      remaining = remaining.slice(1)
      continue
    }
    // Comma
    if (remaining[0] === ',') {
      parts.push(<span key={`p${idx++}`} style={{ color: TOML_COLORS.punct }}>,</span>)
      remaining = remaining.slice(1)
      continue
    }
    // Whitespace or other character — pass through
    parts.push(remaining[0])
    remaining = remaining.slice(1)
  }

  return <>{parts}</>
}

// ---------------------------------------------------------------------------
// Simple TOML parser — handles the full .agent.toml schema
// ---------------------------------------------------------------------------

function parseAgentToml(content: string): AgentProfile | null {
  if (!content.trim()) return null

  const result: AgentProfile = {
    agent: {},
    requirements: { files: [], tech_stack: [], extra: {} },
    dependencies: { plugins: [], skills: [], mcp_servers: [], tools: [], extra: {} },
    skills: { primary: [], secondary: [], specialized: [], excluded: {} },
    agents: { recommended: [] },
    commands: { recommended: [] },
    rules: { recommended: [] },
    mcp: { recommended: [] },
    hooks: { recommended: [] },
    lsp: { recommended: [] },
  }

  // Join multi-line arrays: "key = [\n  ...\n]" → "key = [ ... ]"
  const normalized = content.replace(/=\s*\[\s*\n([\s\S]*?)\]/g, (m) =>
    m.replace(/\n/g, ' '),
  )
  let section = ''

  for (const line of normalized.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue

    const secMatch = t.match(/^\[{1,2}([^\]]+)\]{1,2}$/)
    if (secMatch) { section = secMatch[1].trim(); continue }

    const eqIdx = t.indexOf('=')
    if (eqIdx === -1) continue

    const key = t.substring(0, eqIdx).trim()
    const raw = t.substring(eqIdx + 1).trim()

    const str = (v: string) => v.replace(/^["']|["']$/g, '')
    const arr = (v: string): string[] => {
      const inner = v.replace(/^\[/, '').replace(/\]$/, '').trim()
      if (!inner) return []
      return inner.split(',').map(s => str(s.trim())).filter(Boolean)
    }

    if (section === 'agent') {
      result.agent[key] = str(raw)
    } else if (section === 'requirements') {
      if (key === 'files') result.requirements.files = arr(raw)
      else if (key === 'project_type') result.requirements.project_type = str(raw)
      else if (key === 'tech_stack') result.requirements.tech_stack = arr(raw)
      else result.requirements.extra[key] = str(raw)
    } else if (section === 'dependencies') {
      if (key === 'plugins') result.dependencies.plugins = arr(raw)
      else if (key === 'skills') result.dependencies.skills = arr(raw)
      else if (key === 'mcp_servers') result.dependencies.mcp_servers = arr(raw)
      else if (key === 'tools') result.dependencies.tools = arr(raw)
      else result.dependencies.extra[key] = str(raw)
    } else if (section === 'skills') {
      if (key === 'primary') result.skills.primary = arr(raw)
      else if (key === 'secondary') result.skills.secondary = arr(raw)
      else if (key === 'specialized') result.skills.specialized = arr(raw)
    } else if (section === 'skills.excluded') {
      // Excluded skills have "name" = "Reason"
      result.skills.excluded[str(key)] = str(raw)
    } else if (section === 'agents') {
      if (key === 'recommended') result.agents.recommended = arr(raw)
    } else if (section === 'commands') {
      if (key === 'recommended') result.commands.recommended = arr(raw)
    } else if (section === 'rules') {
      if (key === 'recommended') result.rules.recommended = arr(raw)
      else if (key === 'items') result.rules.recommended = arr(raw)
    } else if (section === 'mcp') {
      if (key === 'recommended') result.mcp.recommended = arr(raw)
    } else if (section === 'hooks') {
      if (key === 'recommended') result.hooks.recommended = arr(raw)
    } else if (section === 'lsp') {
      if (key === 'recommended') result.lsp.recommended = arr(raw)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Fire divider — gradient line between sections
// ---------------------------------------------------------------------------

function FireDivider() {
  return (
    <div
      className="h-[2px] my-3 rounded-full"
      style={{
        background: `linear-gradient(90deg, transparent 0%, ${P.dividerLeft} 15%, ${P.dividerMid} 50%, ${P.dividerRight} 85%, transparent 100%)`,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// ElementBadge — styled badge with tooltip + copy-to-clipboard
// ---------------------------------------------------------------------------

function ElementBadge({
  name,
  kind,
  plugin,
  description,
  onInsert,
}: {
  name: string
  kind: BadgeKind
  plugin?: string
  description?: string
  onInsert?: (text: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const colors = P.badge[kind] ?? P.badge.rule

  const fullName = plugin ? `${plugin}/${name}` : name

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(fullName)
    if (onInsert) onInsert(fullName)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleMouseEnter = () => {
    setHover(true)
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect()
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top,
      })
    }
  }

  return (
    <div
      ref={badgeRef}
      className="relative inline-flex items-center group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono leading-none cursor-default transition-all"
        style={{
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
        }}
      >
        {name}
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
          title="Copy to clipboard"
        >
          {copied
            ? <Check size={10} className="text-green-400" />
            : <Clipboard size={10} style={{ color: colors.text }} />
          }
        </button>
      </span>

      {/* Tooltip — rendered via portal to escape overflow:hidden containers */}
      {hover && tooltipPos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className="rounded-lg px-3 py-2 text-[11px] shadow-2xl min-w-[160px] max-w-[260px] whitespace-normal mb-2"
            style={{
              backgroundColor: '#1a1414',
              border: `1px solid ${P.cardBorder}`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            <div className="font-semibold mb-1" style={{ color: colors.text }}>{name}</div>
            <div className="text-[10px] mb-1" style={{ color: P.textMuted }}>{colors.label}</div>
            {plugin && (
              <div style={{ color: P.textSec }}>
                Plugin: <span style={{ color: P.badge['dep-plugin'].text }}>{plugin}</span>
              </div>
            )}
            {description && (
              <div className="mt-1 leading-snug" style={{ color: '#c8bcbc' }}>{description}</div>
            )}
            {!plugin && !description && kind !== 'rule' && (
              <div className="mt-1 italic" style={{ color: P.textMuted }}>Click clipboard icon to copy name</div>
            )}
          </div>
          {/* Arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 w-2 h-2 rotate-45"
            style={{ backgroundColor: '#1a1414', borderRight: `1px solid ${P.cardBorder}`, borderBottom: `1px solid ${P.cardBorder}` }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionCard — collapsible section with large bold header + fire divider
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  count,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
  count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <FireDivider />
      <div
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: P.cardBg, border: `1px solid ${P.cardBorder}` }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
        >
          {open
            ? <ChevronDown size={14} style={{ color: P.goldDim }} />
            : <ChevronRight size={14} style={{ color: P.goldDim }} />
          }
          <Icon size={16} style={{ color: P.gold }} />
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: P.gold }}>
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span
              className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-mono font-bold"
              style={{ backgroundColor: P.cardBorder, color: P.textSec }}
            >
              {count}
            </span>
          )}
        </button>
        {open && (
          <div className="px-4 pb-4">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SubSection label for skill tiers / dependency types
// ---------------------------------------------------------------------------

function SubLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-bold mt-3 mb-1.5 first:mt-0" style={{ color: P.textMuted }}>
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Key-value display for agent metadata
// ---------------------------------------------------------------------------

function KvRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {Icon && <Icon size={11} style={{ color: P.textMuted }} className="shrink-0" />}
      <span className="text-[10px] uppercase tracking-wider font-bold shrink-0" style={{ color: P.textMuted }}>{label}</span>
      <span
        className="text-[11px] font-mono truncate ml-auto text-right"
        style={{ color: P.textSec }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="text-[11px] italic py-1" style={{ color: P.textMuted }}>
      — none —
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TomlPreviewPanel({ tomlPath, onClose, onInsertToPrompt }: TomlPreviewPanelProps) {
  const [content, setContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'rich' | 'raw'>('rich')
  // PSS element descriptions — fetched once per profile change
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const lastDescQueryRef = useRef('')

  const fetchToml = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/creation-helper/toml-preview?path=${encodeURIComponent(tomlPath)}`,
      )
      if (!res.ok) return
      const data: { content: string; exists: boolean } = await res.json()
      setContent(data.content)
      setExists(data.exists)
    } catch {
      // Silently ignore — will retry on next poll
    } finally {
      setLoading(false)
    }
  }, [tomlPath])

  useEffect(() => {
    fetchToml()
    const interval = setInterval(fetchToml, 5000)
    return () => clearInterval(interval)
  }, [fetchToml])

  const profile = useMemo(() => parseAgentToml(content), [content])

  // Fetch PSS descriptions for all named elements whenever profile changes
  useEffect(() => {
    if (!profile) return
    // Collect all element names that PSS might know about
    const names = [
      ...profile.skills.primary,
      ...profile.skills.secondary,
      ...profile.skills.specialized,
      ...Object.keys(profile.skills.excluded),
      ...profile.agents.recommended,
      ...profile.commands.recommended,
      ...profile.mcp.recommended,
      ...profile.hooks.recommended,
      ...profile.lsp.recommended,
      ...profile.rules.recommended,
      ...profile.dependencies.plugins,
      ...profile.dependencies.skills,
      ...profile.dependencies.mcp_servers,
    ]
    if (names.length === 0) return
    // Deduplicate and create a stable key to avoid re-fetching same set
    const unique = [...new Set(names)].sort()
    const queryKey = unique.join(',')
    if (queryKey === lastDescQueryRef.current) return
    lastDescQueryRef.current = queryKey

    fetch('/api/agents/creation-helper/element-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: unique }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.descriptions) {
          const map: Record<string, string> = {}
          for (const [name, info] of Object.entries(data.descriptions)) {
            const d = info as { description: string }
            if (d.description) map[name] = d.description
          }
          setDescriptions(map)
        }
      })
      .catch(() => { /* ignore — descriptions are optional */ })
  }, [profile])

  const handleInsert = useCallback((text: string) => {
    if (onInsertToPrompt) onInsertToPrompt(text)
  }, [onInsertToPrompt])

  // Count total elements for section badges
  const skillCount = profile
    ? (profile.skills.primary.length + profile.skills.secondary.length + profile.skills.specialized.length)
    : 0
  const excludedCount = profile ? Object.keys(profile.skills.excluded).length : 0
  const depCount = profile
    ? (profile.dependencies.plugins.length + profile.dependencies.skills.length +
       profile.dependencies.mcp_servers.length + profile.dependencies.tools.length)
    : 0
  const reqCount = profile
    ? (profile.requirements.files.length + profile.requirements.tech_stack.length +
       (profile.requirements.project_type ? 1 : 0))
    : 0

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: P.panelBg }}>
      {/* Panel header with tabs */}
      <div
        className="shrink-0"
        style={{ borderBottom: `1px solid ${P.cardBorder}` }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: P.gold }}>
            Agent Profile
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setLoading(true); fetchToml() }}
              className="p-1 rounded transition-colors"
              style={{ color: P.textMuted }}
              title="Refresh"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded transition-colors"
                style={{ color: P.textMuted }}
                title="Close"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        {exists && (
          <div className="flex px-3 gap-1">
            <button
              onClick={() => setActiveTab('rich')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-t-md transition-colors"
              style={{
                backgroundColor: activeTab === 'rich' ? P.cardBg : 'transparent',
                color: activeTab === 'rich' ? P.gold : P.textMuted,
                borderTop: activeTab === 'rich' ? `2px solid ${P.gold}` : '2px solid transparent',
                borderLeft: activeTab === 'rich' ? `1px solid ${P.cardBorder}` : '1px solid transparent',
                borderRight: activeTab === 'rich' ? `1px solid ${P.cardBorder}` : '1px solid transparent',
              }}
            >
              <Layers size={11} />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-t-md transition-colors"
              style={{
                backgroundColor: activeTab === 'raw' ? P.cardBg : 'transparent',
                color: activeTab === 'raw' ? P.gold : P.textMuted,
                borderTop: activeTab === 'raw' ? `2px solid ${P.gold}` : '2px solid transparent',
                borderLeft: activeTab === 'raw' ? `1px solid ${P.cardBorder}` : '1px solid transparent',
                borderRight: activeTab === 'raw' ? `1px solid ${P.cardBorder}` : '1px solid transparent',
              }}
            >
              <Code2 size={11} />
              Raw TOML
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        {!exists ? (
          /* ---- Empty state ---- */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/avatars/creation-header.jpg?v=20260316"
              alt=""
              className="w-3/4 max-w-[300px] opacity-40"
            />
            <p className="text-center text-xs leading-relaxed max-w-[220px]" style={{ color: P.textMuted }}>
              No profile yet. Chat with Haephestos to start forging your agent.
            </p>
          </div>
        ) : activeTab === 'raw' ? (
          /* ---- Raw TOML view with syntax highlighting ---- */
          <pre
            className="text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed p-4"
            style={{ color: P.text }}
          >
            {highlightToml(content)}
          </pre>
        ) : profile ? (
          /* ---- Rich profile card ---- */
          <div className="p-3">
            {/* Banner image — tightly cropped */}
            <div className="rounded-lg overflow-hidden mb-3" style={{ backgroundColor: '#0a0606' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/avatars/creation-header.jpg?v=20260316"
                alt="Agent Creation"
                className="w-full h-auto opacity-90"
                style={{ display: 'block' }}
              />
            </div>

            {/* ============ AGENT IDENTITY ============ */}
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: P.cardBg,
                border: `1px solid ${P.cardBorder}`,
                backgroundImage: `linear-gradient(135deg, ${P.cardBg} 0%, #1a0e10 100%)`,
              }}
            >
              {profile.agent.name ? (
                <div className="flex items-start gap-2 mb-2">
                  <Cog size={18} style={{ color: P.gold }} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="text-lg font-bold tracking-tight" style={{ color: P.text }}>
                      {profile.agent.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {profile.agent.model && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                          style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4e', color: '#a0a0d0' }}
                        >
                          {profile.agent.model}
                        </span>
                      )}
                      {profile.agent.program && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                          style={{ backgroundColor: '#1a1e1a', border: '1px solid #2a3e2a', color: '#a0c0a0' }}
                        >
                          {profile.agent.program}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm italic mb-2" style={{ color: P.textMuted }}>Agent name pending...</div>
              )}

              {/* All agent fields as key-value rows */}
              {profile.agent.workingDirectory && (
                <KvRow label="Dir" value={profile.agent.workingDirectory} icon={FolderOpen} />
              )}
              {profile.agent.teamId && (
                <KvRow label="Team" value={profile.agent.teamId} icon={Shield} />
              )}
              {profile.agent.source && (
                <KvRow label="Source" value={profile.agent.source} icon={FileCode} />
              )}
              {profile.agent.path && (
                <KvRow label="Path" value={profile.agent.path} icon={FolderOpen} />
              )}
              {/* Show any extra agent fields not covered above */}
              {Object.entries(profile.agent)
                .filter(([k]) => !['name', 'model', 'program', 'workingDirectory', 'teamId', 'source', 'path'].includes(k))
                .map(([k, v]) => (
                  <KvRow key={k} label={k} value={v} />
                ))
              }
            </div>

            {/* ============ REQUIREMENTS ============ */}
            <SectionCard title="Requirements" icon={BookOpen} count={reqCount}>
              <SubLabel label="Project Type" />
              {profile.requirements.project_type ? (
                <div
                  className="text-[11px] font-mono px-2.5 py-1.5 rounded"
                  style={{ backgroundColor: P.badge.tech.bg, border: `1px solid ${P.badge.tech.border}`, color: P.badge.tech.text }}
                >
                  {profile.requirements.project_type}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Tech Stack" />
              {profile.requirements.tech_stack.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.requirements.tech_stack.map(t => (
                    <ElementBadge key={t} name={t} kind="tech" onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Reference Files" />
              {profile.requirements.files.length > 0 ? (
                <div className="space-y-1">
                  {profile.requirements.files.map(f => (
                    <div
                      key={f}
                      className="text-[11px] font-mono px-2.5 py-1 rounded truncate"
                      style={{ backgroundColor: P.badge.rule.bg, border: `1px solid ${P.badge.rule.border}`, color: P.textSec }}
                      title={f}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              ) : <EmptyHint />}
              {Object.entries(profile.requirements.extra).map(([k, v]) => (
                <KvRow key={k} label={k} value={v} />
              ))}
            </SectionCard>

            {/* ============ SKILLS ============ */}
            <SectionCard title="Skills" icon={Zap} count={skillCount + excludedCount}>
              <SubLabel label="Primary" />
              {profile.skills.primary.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.primary.map(s => (
                    <ElementBadge key={s} name={s} kind="primary-skill" description={descriptions[s]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Secondary" />
              {profile.skills.secondary.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.secondary.map(s => (
                    <ElementBadge key={s} name={s} kind="secondary-skill" description={descriptions[s]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Specialized" />
              {profile.skills.specialized.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.specialized.map(s => (
                    <ElementBadge key={s} name={s} kind="specialized-skill" description={descriptions[s]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              {excludedCount > 0 && (
                <>
                  <SubLabel label="Excluded (with reasons)" />
                  <div className="space-y-1">
                    {Object.entries(profile.skills.excluded).map(([name, reason]) => (
                      <div
                        key={name}
                        className="flex gap-2 text-[11px] rounded px-2.5 py-1.5"
                        style={{
                          backgroundColor: P.badge.excluded.bg,
                          border: `1px solid ${P.badge.excluded.border}`,
                        }}
                      >
                        <span className="font-mono shrink-0 line-through" style={{ color: P.badge.excluded.text }}>
                          {name}
                        </span>
                        <span className="italic" style={{ color: P.textMuted }}>{reason}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>

            {/* ============ SUB-AGENTS ============ */}
            <SectionCard title="Sub-Agents" icon={Users} count={profile.agents.recommended.length}>
              {profile.agents.recommended.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.agents.recommended.map(a => (
                    <ElementBadge key={a} name={a} kind="agent" description={descriptions[a]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ COMMANDS ============ */}
            <SectionCard title="Commands" icon={Command} count={profile.commands.recommended.length}>
              {profile.commands.recommended.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.commands.recommended.map(c => (
                    <ElementBadge key={c} name={c} kind="command" description={descriptions[c]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ MCP SERVERS ============ */}
            <SectionCard title="MCP Servers" icon={Server} count={profile.mcp.recommended.length}>
              {profile.mcp.recommended.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.mcp.recommended.map(m => (
                    <ElementBadge key={m} name={m} kind="mcp-server" description={descriptions[m]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ HOOKS ============ */}
            <SectionCard title="Hooks" icon={Webhook} count={profile.hooks.recommended.length}>
              {profile.hooks.recommended.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.hooks.recommended.map(h => (
                    <ElementBadge key={h} name={h} kind="hook" description={descriptions[h]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ RULES ============ */}
            <SectionCard title="Rules" icon={ScrollText} count={profile.rules.recommended.length}>
              {profile.rules.recommended.length > 0 ? (
                <div className="space-y-1.5">
                  {profile.rules.recommended.map((rule, i) => (
                    <div
                      key={i}
                      className="flex gap-2 text-[11px] leading-relaxed rounded px-2.5 py-1.5"
                      style={{
                        backgroundColor: P.badge.rule.bg,
                        border: `1px solid ${P.badge.rule.border}`,
                        color: P.badge.rule.text,
                      }}
                    >
                      <span className="font-mono shrink-0" style={{ color: P.goldDim }}>{i + 1}.</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ LSP SERVERS ============ */}
            <SectionCard title="LSP Servers" icon={Terminal} count={profile.lsp.recommended.length}>
              {profile.lsp.recommended.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.lsp.recommended.map(l => (
                    <ElementBadge key={l} name={l} kind="lsp" description={descriptions[l]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
            </SectionCard>

            {/* ============ DEPENDENCIES ============ */}
            <SectionCard title="Dependencies" icon={Puzzle} count={depCount}>
              <SubLabel label="Plugins" />
              {profile.dependencies.plugins.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.dependencies.plugins.map(p => (
                    <ElementBadge key={p} name={p} kind="dep-plugin" description={descriptions[p]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Built-in Skills" />
              {profile.dependencies.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.dependencies.skills.map(s => (
                    <ElementBadge key={s} name={s} kind="dep-skill" plugin="ai-maestro" description={descriptions[s]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="MCP Servers" />
              {profile.dependencies.mcp_servers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.dependencies.mcp_servers.map(m => (
                    <ElementBadge key={m} name={m} kind="dep-mcp" description={descriptions[m]} onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              <SubLabel label="Tools" />
              {profile.dependencies.tools.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.dependencies.tools.map(t => (
                    <ElementBadge key={t} name={t} kind="dep-tool" onInsert={handleInsert} />
                  ))}
                </div>
              ) : <EmptyHint />}
              {Object.entries(profile.dependencies.extra).map(([k, v]) => (
                <KvRow key={k} label={k} value={v} />
              ))}
            </SectionCard>

          </div>
        ) : (
          /* ---- Parse error fallback: show raw with highlighting ---- */
          <pre
            className="text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed p-4"
            style={{ color: P.text }}
          >
            {highlightToml(content)}
          </pre>
        )}
      </div>
    </div>
  )
}
