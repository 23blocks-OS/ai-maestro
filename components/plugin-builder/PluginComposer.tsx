'use client'

import { X, Package, GitBranch, Brain, Layers } from 'lucide-react'
import type { PluginSkillSelection } from '@/types/plugin-builder'
import { getSkillKey } from './SkillPicker'

interface PluginComposerProps {
  name: string
  version: string
  description: string
  includeHooks: boolean
  skills: PluginSkillSelection[]
  onNameChange: (name: string) => void
  onVersionChange: (version: string) => void
  onDescriptionChange: (desc: string) => void
  onIncludeHooksChange: (include: boolean) => void
  onRemoveSkill: (key: string) => void
}

export default function PluginComposer({
  name,
  version,
  description,
  includeHooks,
  skills,
  onNameChange,
  onVersionChange,
  onDescriptionChange,
  onIncludeHooksChange,
  onRemoveSkill,
}: PluginComposerProps) {
  // Group skills by type
  const coreSkills = skills.filter(s => s.type === 'core')
  const marketplaceSkills = skills.filter(s => s.type === 'marketplace')
  const repoSkills = skills.filter(s => s.type === 'repo')

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-3">Plugin Configuration</h2>

        {/* Metadata form */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Plugin Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="my-custom-plugin"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Version</label>
              <input
                type="text"
                value={version}
                onChange={(e) => onVersionChange(e.target.value)}
                placeholder="1.0.0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2">
                <input
                  type="checkbox"
                  checked={includeHooks}
                  onChange={(e) => onIncludeHooksChange(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500/30"
                />
                <span className="text-sm text-gray-300">Include hooks</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="A custom plugin for..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
        </div>
      </div>

      {/* Selected Skills */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Selected Skills
          </h3>
          <span className="text-xs text-gray-500">
            {skills.length} skill{skills.length !== 1 ? 's' : ''}
          </span>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-8">
            <Layers className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No skills selected yet.</p>
            <p className="text-xs text-gray-600 mt-1">Browse skills on the left to add them.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Core Skills Group */}
            {coreSkills.length > 0 && (
              <SkillGroup
                title="Core (AI Maestro)"
                icon={<Brain className="w-3.5 h-3.5" />}
                color="cyan"
                skills={coreSkills}
                onRemove={onRemoveSkill}
              />
            )}

            {/* Marketplace Skills Group */}
            {marketplaceSkills.length > 0 && (
              <SkillGroup
                title="Marketplace"
                icon={<Package className="w-3.5 h-3.5" />}
                color="amber"
                skills={marketplaceSkills}
                onRemove={onRemoveSkill}
              />
            )}

            {/* Repo Skills Group */}
            {repoSkills.length > 0 && (
              <SkillGroup
                title="External Repos"
                icon={<GitBranch className="w-3.5 h-3.5" />}
                color="emerald"
                skills={repoSkills}
                onRemove={onRemoveSkill}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SkillGroup({
  title,
  icon,
  color,
  skills,
  onRemove,
}: {
  title: string
  icon: React.ReactNode
  color: 'cyan' | 'amber' | 'emerald'
  skills: PluginSkillSelection[]
  onRemove: (key: string) => void
}) {
  const colorClasses = {
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  }

  return (
    <div>
      <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded-md border ${colorClasses[color]} text-xs font-medium`}>
        {icon}
        {title}
        <span className="ml-auto opacity-60">{skills.length}</span>
      </div>
      <div className="space-y-1">
        {skills.map(skill => {
          const key = getSkillKey(skill)
          const displayName = getSkillDisplayName(skill)
          const subtitle = getSkillSubtitle(skill)

          return (
            <div
              key={key}
              className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-300 truncate">{displayName}</p>
                {subtitle && (
                  <p className="text-xs text-gray-600 truncate">{subtitle}</p>
                )}
              </div>
              <button
                onClick={() => onRemove(key)}
                className="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title="Remove skill"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getSkillDisplayName(skill: PluginSkillSelection): string {
  switch (skill.type) {
    case 'core':
      return skill.name
    case 'marketplace':
      return skill.id.split(':')[2] || skill.id
    case 'repo':
      return skill.name
  }
}

function getSkillSubtitle(skill: PluginSkillSelection): string | null {
  switch (skill.type) {
    case 'core':
      return null
    case 'marketplace':
      return `${skill.plugin} / ${skill.marketplace}`
    case 'repo':
      return skill.url.replace(/^https?:\/\//, '').replace(/\.git$/, '')
  }
}
