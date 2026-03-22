'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Hammer,
  Sparkles,
  Puzzle,
  Server,
  Webhook,
  ScrollText,
  Tag,
  X,
  User,
  FolderOpen,
  Cpu,
  Shield,
} from 'lucide-react'

// --- Types (local to avoid circular imports from API routes) ---

export interface AgentConfigDraft {
  name?: string
  program?: string
  model?: string
  role?: 'manager' | 'chief-of-staff' | 'member'
  workingDirectory?: string
  skills: Array<{ name: string; description: string }>
  plugins: Array<{ name: string; description: string }>
  mcpServers: Array<{ name: string; description: string }>
  hooks: Array<{ name: string; description: string }>
  programArgs?: string
  rules: string[]
  tags: string[]
  teamId?: string
}

export function createEmptyDraft(): AgentConfigDraft {
  return {
    skills: [],
    plugins: [],
    mcpServers: [],
    hooks: [],
    rules: [],
    tags: [],
  }
}

interface AgentConfigPanelProps {
  config: AgentConfigDraft
  isBuilding: boolean
  onRemove?: (field: string, name: string) => void
}

// --- Animation variants ---

const itemVariants = {
  initial: { opacity: 0, y: -8, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.95 },
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  'chief-of-staff': 'Chief of Staff',
  member: 'Member',
}

// --- Section header with icon, title, and count badge ---

function SectionHeader({
  icon: Icon,
  title,
  count,
  colorClass,
}: {
  icon: typeof Sparkles
  title: string
  count: number
  colorClass: string
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </span>
      {count > 0 && (
        <span
          className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colorClass} bg-gray-800 border border-gray-700/60`}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// --- Removable item chip with name + description ---

function ItemChip({
  name,
  description,
  field,
  colorBorder,
  colorText,
  colorBg,
  onRemove,
}: {
  name: string
  description: string
  field: string
  colorBorder: string
  colorText: string
  colorBg: string
  onRemove?: (field: string, name: string) => void
}) {
  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2 }}
      className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg border ${colorBorder} ${colorBg} transition-colors duration-200`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${colorText} truncate`}>{name}</p>
        {description && (
          <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(field, name)
          }}
          className="flex-shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-700/60 transition-all duration-150"
          title={`Remove ${name}`}
        >
          <X className="w-3 h-3 text-gray-500 hover:text-gray-300" />
        </button>
      )}
    </motion.div>
  )
}

// --- Placeholder for empty sections ---

function EmptyPlaceholder({ text }: { text: string }) {
  return (
    <p className="text-[11px] text-gray-600 italic py-1.5 px-1">{text}</p>
  )
}

// --- Basic info row ---

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User
  label: string
  value?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      <span className="text-[11px] text-gray-500 w-16 flex-shrink-0">{label}</span>
      {value ? (
        <span className="text-xs text-gray-200 truncate">{value}</span>
      ) : (
        <span className="text-xs text-gray-600 italic">(not set yet)</span>
      )}
    </div>
  )
}

// --- Main component ---

export default function AgentConfigPanel({
  config,
  isBuilding,
  onRemove,
}: AgentConfigPanelProps) {
  return (
    <div className="hidden md:block w-80 flex-shrink-0 h-full overflow-y-auto bg-gray-900 border-l border-gray-800 px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Hammer className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-200">Agent Configuration</h2>
        </div>
        {isBuilding && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-[10px] text-amber-400/80 font-medium">Configuring...</span>
          </div>
        )}
      </div>

      {/* Basic Info */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Basic Info
          </span>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 space-y-0.5">
          <InfoRow icon={User} label="Name" value={config.name} />
          <InfoRow icon={Cpu} label="Program" value={config.program} />
          <InfoRow icon={Cpu} label="Model" value={config.model} />
          <InfoRow icon={Shield} label="Role" value={config.role ? ROLE_LABELS[config.role] : undefined} />
          <InfoRow icon={FolderOpen} label="Dir" value={config.workingDirectory} />
        </div>
      </div>

      {/* Chip-based sections: skills, plugins, mcpServers, hooks */}
      {([
        { field: 'skills' as const, title: 'Skills', icon: Sparkles, hdr: 'text-emerald-400', border: 'border-emerald-500/20', text: 'text-emerald-300', bg: 'bg-emerald-500/5', empty: 'No skills added yet' },
        { field: 'plugins' as const, title: 'Plugins', icon: Puzzle, hdr: 'text-blue-400', border: 'border-blue-500/20', text: 'text-blue-300', bg: 'bg-blue-500/5', empty: 'No plugins added yet' },
        { field: 'mcpServers' as const, title: 'MCP Servers', icon: Server, hdr: 'text-purple-400', border: 'border-purple-500/20', text: 'text-purple-300', bg: 'bg-purple-500/5', empty: 'No MCP servers added yet' },
        { field: 'hooks' as const, title: 'Hooks', icon: Webhook, hdr: 'text-amber-400', border: 'border-amber-500/20', text: 'text-amber-300', bg: 'bg-amber-500/5', empty: 'No hooks added yet' },
      ] as const).map(({ field, title, icon, hdr, border, text, bg, empty }) => {
        const items = config[field]
        return (
          <div key={field} className="mb-4">
            <SectionHeader icon={icon} title={title} count={items.length} colorClass={hdr} />
            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <ItemChip
                    key={`${field}-${item.name}`}
                    name={item.name}
                    description={item.description}
                    field={field}
                    colorBorder={border}
                    colorText={text}
                    colorBg={bg}
                    onRemove={onRemove}
                  />
                ))}
              </AnimatePresence>
              {items.length === 0 && <EmptyPlaceholder text={empty} />}
            </div>
          </div>
        )
      })}

      {/* Rules */}
      <div className="mb-4">
        <SectionHeader
          icon={ScrollText}
          title="Rules"
          count={config.rules.length}
          colorClass="text-gray-400"
        />
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {config.rules.map((rule) => (
              <motion.div
                key={`rule-${rule}`}
                layout
                variants={itemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="group flex items-start gap-2 px-2.5 py-2 rounded-lg border border-gray-700/30 bg-gray-800/20"
              >
                <span className="text-gray-600 text-[11px] mt-px select-none">&ldquo;</span>
                <p className="flex-1 text-[11px] text-gray-400 leading-snug italic line-clamp-3">
                  {rule}
                </p>
                <span className="text-gray-600 text-[11px] mt-px select-none">&rdquo;</span>
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove('rules', rule)
                    }}
                    className="flex-shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-700/60 transition-all duration-150"
                    title="Remove rule"
                  >
                    <X className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {config.rules.length === 0 && (
            <EmptyPlaceholder text="No rules added yet" />
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="mb-4">
        <SectionHeader
          icon={Tag}
          title="Tags"
          count={config.tags.length}
          colorClass="text-cyan-400"
        />
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence mode="popLayout">
            {config.tags.map((tag) => (
              <motion.span
                key={`tag-${tag}`}
                layout
                variants={itemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="group inline-flex items-center gap-1 text-[11px] text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2.5 py-1"
              >
                {tag}
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove('tags', tag)
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-cyan-200 transition-opacity duration-150"
                    title={`Remove tag "${tag}"`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </motion.span>
            ))}
          </AnimatePresence>
          {config.tags.length === 0 && (
            <EmptyPlaceholder text="No tags added yet" />
          )}
        </div>
      </div>
    </div>
  )
}
