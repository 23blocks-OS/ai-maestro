'use client'

import { useState, useCallback, useMemo } from 'react'
import { ArrowLeft, Puzzle } from 'lucide-react'
import Link from 'next/link'
import SkillPicker, { getSkillKey } from '@/components/plugin-builder/SkillPicker'
import PluginComposer from '@/components/plugin-builder/PluginComposer'
import BuildAction from '@/components/plugin-builder/BuildAction'
import type { PluginSkillSelection, PluginBuildConfig } from '@/types/plugin-builder'

export default function PluginBuilderPage() {
  // Plugin metadata
  const [name, setName] = useState('my-custom-plugin')
  const [version, setVersion] = useState('1.0.0')
  const [description, setDescription] = useState('')
  const [includeHooks, setIncludeHooks] = useState(true)

  // Selected skills
  const [skills, setSkills] = useState<PluginSkillSelection[]>([])

  const handleAddSkill = useCallback((skill: PluginSkillSelection) => {
    setSkills(prev => {
      const key = getSkillKey(skill)
      // Deduplicate
      if (prev.some(s => getSkillKey(s) === key)) return prev
      return [...prev, skill]
    })
  }, [])

  const handleRemoveSkill = useCallback((key: string) => {
    setSkills(prev => prev.filter(s => getSkillKey(s) !== key))
  }, [])

  // Build config
  const buildConfig: PluginBuildConfig = useMemo(() => ({
    name,
    version,
    description: description || undefined,
    skills,
    includeHooks,
  }), [name, version, description, skills, includeHooks])

  // Validation
  const isValid = name.trim().length > 0
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
    && version.trim().length > 0
    && skills.length > 0

  const disabledReason = !name.trim()
    ? 'Enter a plugin name'
    : !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
    ? 'Invalid plugin name (letters, numbers, hyphens, underscores only)'
    : !version.trim()
    ? 'Enter a version'
    : skills.length === 0
    ? 'Select at least one skill'
    : undefined

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-gray-900/80 border-b border-gray-800">
        <Link
          href="/"
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Puzzle className="w-5 h-5 text-cyan-400" />
        <h1 className="text-lg font-semibold text-white">Plugin Builder</h1>
        <span className="text-xs text-gray-500 ml-2">Compose custom Claude Code plugins</span>
      </header>

      {/* Main content: two columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Skill Picker */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          <SkillPicker
            selectedSkills={skills}
            onAddSkill={handleAddSkill}
            onRemoveSkill={handleRemoveSkill}
          />
        </div>

        {/* Right: Plugin Composer */}
        <div className="w-1/2 flex flex-col">
          <PluginComposer
            name={name}
            version={version}
            description={description}
            includeHooks={includeHooks}
            skills={skills}
            onNameChange={setName}
            onVersionChange={setVersion}
            onDescriptionChange={setDescription}
            onIncludeHooksChange={setIncludeHooks}
            onRemoveSkill={handleRemoveSkill}
          />
        </div>
      </div>

      {/* Bottom: Build Action */}
      <BuildAction
        config={buildConfig}
        disabled={!isValid}
        disabledReason={disabledReason}
      />
    </div>
  )
}
