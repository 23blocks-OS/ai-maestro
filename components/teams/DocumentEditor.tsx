'use client'

import { useState } from 'react'
import { Save, X, Pin } from 'lucide-react'

interface DocumentEditorProps {
  initialTitle?: string
  initialContent?: string
  initialPinned?: boolean
  onSave: (data: { title: string; content: string; pinned: boolean }) => Promise<void>
  onCancel: () => void
}

export default function DocumentEditor({ initialTitle = '', initialContent = '', initialPinned = false, onSave, onCancel }: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [pinned, setPinned] = useState(initialPinned)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), content, pinned })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Document title..."
          className="flex-1 bg-transparent text-white text-lg font-medium focus:outline-none placeholder:text-gray-600"
          autoFocus
        />
        <button
          onClick={() => setPinned(!pinned)}
          className={`p-1.5 rounded transition-colors ${pinned ? 'text-amber-400 bg-amber-400/10' : 'text-gray-500 hover:text-gray-300'}`}
          title={pinned ? 'Unpin document' : 'Pin document'}
        >
          <Pin className="w-4 h-4" />
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write your document content in markdown..."
        className="flex-1 bg-transparent text-gray-200 text-sm p-4 focus:outline-none resize-none font-mono leading-relaxed placeholder:text-gray-600"
      />
    </div>
  )
}
