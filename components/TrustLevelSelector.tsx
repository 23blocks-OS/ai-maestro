'use client'

import { Shield, FileEdit, Brain, Zap, Eye } from 'lucide-react'
import type { AgentPermissionMode } from '@/types/agent'

interface TrustLevelSelectorProps {
  value: AgentPermissionMode
  onChange: (mode: AgentPermissionMode) => void
  compact?: boolean
}

const TRUST_LEVELS: {
  id: AgentPermissionMode
  name: string
  description: string
  detail: string
  icon: typeof Shield
  color: string
}[] = [
  {
    id: 'supervised',
    name: 'Supervised',
    description: 'Asks before every file edit and shell command',
    detail: 'Safest mode. The agent pauses and asks you to approve each action before it runs. Good for sensitive repos or when you want full control.',
    icon: Shield,
    color: 'emerald',
  },
  {
    id: 'planOnly',
    name: 'Plan Only',
    description: 'Can read and analyze code, but cannot make changes',
    detail: 'The agent can explore files and answer questions, but cannot edit files or run commands. Use this for code reviews, architecture analysis, or research.',
    icon: Eye,
    color: 'gray',
  },
  {
    id: 'trustEdits',
    name: 'Trust Edits',
    description: 'Auto-approves file edits, still asks for shell commands',
    detail: 'The agent can freely create and modify files without asking, but will still prompt you before running any terminal commands. A good balance of speed and safety.',
    icon: FileEdit,
    color: 'blue',
  },
  {
    id: 'smartAuto',
    name: 'Smart Auto',
    description: 'Auto-approves safe actions, asks only for risky ones',
    detail: 'The agent uses its own judgment to auto-approve routine operations (edits, safe shell commands) and only prompts you for potentially destructive actions like deleting files or force-pushing.',
    icon: Brain,
    color: 'violet',
  },
  {
    id: 'fullAutonomy',
    name: 'Full Autonomy',
    description: 'No permission prompts. The agent runs everything freely.',
    detail: 'YOLO mode. The agent executes all actions without asking. Use only in sandboxed environments or when you fully trust the task. Cannot be undone mid-session.',
    icon: Zap,
    color: 'amber',
  },
]

export default function TrustLevelSelector({ value, onChange, compact }: TrustLevelSelectorProps) {
  const selectedLevel = TRUST_LEVELS.find(l => l.id === value)

  if (compact) {
    return (
      <div className="space-y-1">
        {TRUST_LEVELS.map((level) => {
          const Icon = level.icon
          const isSelected = value === level.id
          return (
            <label
              key={level.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                isSelected ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <input
                type="radio"
                name="trust-level-compact"
                value={level.id}
                checked={isSelected}
                onChange={() => onChange(level.id)}
                className="sr-only"
              />
              <Icon className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-zinc-100' : 'text-zinc-500'}`} />
              <div className="flex-1 min-w-0">
                <span className="flex items-center gap-1">
                  {level.name}
                  {level.id === 'fullAutonomy' && <span className="text-amber-400">!</span>}
                </span>
                <span className="block text-[10px] text-zinc-500 leading-tight mt-0.5">{level.description}</span>
              </div>
            </label>
          )
        })}
        {selectedLevel && (
          <div className="mt-2 px-2 py-2 bg-zinc-800/80 rounded text-[11px] text-zinc-400 leading-relaxed border border-zinc-700/50">
            {selectedLevel.detail}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {TRUST_LEVELS.map((level) => {
        const Icon = level.icon
        const isSelected = value === level.id

        return (
          <button
            key={level.id}
            type="button"
            onClick={() => onChange(level.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
              isSelected
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
            }`}
          >
            <div
              className={`p-1.5 rounded-lg ${
                isSelected ? 'bg-emerald-500/20' : 'bg-zinc-700'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isSelected ? 'text-emerald-400' : 'text-zinc-400'
                }`}
              />
            </div>
            <div className="flex-1 text-left">
              <div
                className={`text-sm font-medium ${
                  isSelected ? 'text-emerald-400' : 'text-zinc-200'
                }`}
              >
                {level.name}
                {level.id === 'fullAutonomy' && (
                  <span className="ml-1 text-amber-400 text-xs">!</span>
                )}
              </div>
              <div className="text-xs text-zinc-500">{level.description}</div>
              {isSelected && (
                <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{level.detail}</div>
              )}
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-zinc-600'
              }`}
            >
              {isSelected && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
