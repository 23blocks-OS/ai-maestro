'use client'

import { useState, useEffect } from 'react'
import { Save, BookOpen } from 'lucide-react'

interface TeamInstructionsSectionProps {
  instructions: string
  onSave: (instructions: string) => Promise<void>
}

export default function TeamInstructionsSection({ instructions: initialInstructions, onSave }: TeamInstructionsSectionProps) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setInstructions(initialInstructions)
    setDirty(false)
  }, [initialInstructions])

  const handleChange = (value: string) => {
    setInstructions(value)
    setDirty(value !== initialInstructions)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(instructions)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Team Instructions</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            These instructions apply to all agents in this team. Write in markdown.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Editor */}
      <textarea
        value={instructions}
        onChange={e => handleChange(e.target.value)}
        placeholder="# Team Instructions&#10;&#10;Write guidelines for how agents in this team should collaborate, communicate, and coordinate their work...&#10;&#10;## Coding Standards&#10;&#10;## Communication Protocol&#10;&#10;## Key Resources"
        className="flex-1 bg-transparent text-gray-200 text-sm p-6 focus:outline-none resize-none font-mono leading-relaxed placeholder:text-gray-600"
      />

      {/* Status bar */}
      {dirty && (
        <div className="px-6 py-2 border-t border-gray-800 flex-shrink-0">
          <p className="text-[10px] text-amber-400">Unsaved changes</p>
        </div>
      )}
    </div>
  )
}
