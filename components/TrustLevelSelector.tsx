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
  icon: typeof Shield
  color: string
}[] = [
  {
    id: 'supervised',
    name: 'Supervised',
    description: 'Asks permission for all risky actions',
    icon: Shield,
    color: 'emerald',
  },
  {
    id: 'trustEdits',
    name: 'Trust Edits',
    description: 'Auto-approves file edits, asks for shell commands',
    icon: FileEdit,
    color: 'blue',
  },
  {
    id: 'smartAuto',
    name: 'Smart Auto',
    description: 'AI reviews and auto-approves safe actions',
    icon: Brain,
    color: 'violet',
  },
  {
    id: 'fullAutonomy',
    name: 'Full Autonomy',
    description: 'No permission prompts at all',
    icon: Zap,
    color: 'amber',
  },
  {
    id: 'planOnly',
    name: 'Plan Only',
    description: 'Read-only, no changes allowed',
    icon: Eye,
    color: 'gray',
  },
]

export default function TrustLevelSelector({ value, onChange, compact }: TrustLevelSelectorProps) {
  if (compact) {
    return (
      <div className="space-y-1">
        {TRUST_LEVELS.map((level) => {
          const Icon = level.icon
          const isSelected = value === level.id
          return (
            <label
              key={level.id}
              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
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
              <Icon className={`w-3 h-3 ${isSelected ? 'text-zinc-100' : 'text-zinc-500'}`} />
              <span>{level.name}</span>
              {level.id === 'fullAutonomy' && <span className="text-amber-400">!</span>}
            </label>
          )
        })}
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
