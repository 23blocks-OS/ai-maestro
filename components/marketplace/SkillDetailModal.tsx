/**
 * Skill Detail Modal Component
 *
 * Shows full details of a skill including SKILL.md content.
 * Allows adding the skill to an agent.
 */

'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Check,
  Package,
  User,
  Tag,
  Code,
  FileText,
  RefreshCw,
  Copy,
  Zap
} from 'lucide-react'
import type { MarketplaceSkill } from '@/types/marketplace'

interface SkillDetailModalProps {
  skill: MarketplaceSkill | null
  isOpen: boolean
  onClose: () => void
  onInstall?: (skill: MarketplaceSkill) => void
  isInstalled?: boolean
  hostUrl?: string
}

export default function SkillDetailModal({
  skill,
  isOpen,
  onClose,
  onInstall,
  isInstalled = false,
  hostUrl = ''
}: SkillDetailModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Load full skill content when modal opens
  useEffect(() => {
    if (isOpen && skill && !skill.content) {
      loadSkillContent()
    } else if (skill?.content) {
      setContent(skill.content)
    }
  }, [isOpen, skill])

  const loadSkillContent = async () => {
    if (!skill) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${hostUrl}/api/marketplace/skills/${encodeURIComponent(skill.id)}?includeContent=true`)
      if (!res.ok) throw new Error('Failed to load skill content')
      const data = await res.json()
      setContent(data.skill?.content || 'No content available')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyId = async () => {
    if (!skill) return
    try {
      await navigator.clipboard.writeText(skill.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (!isOpen || !skill) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-gray-900 rounded-xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0 mt-0.5">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-100 truncate">
                {skill.name}
              </h2>
              <p className="text-sm text-gray-500 flex items-center gap-2 mt-0.5">
                <Package className="w-3.5 h-3.5" />
                <span className="truncate">{skill.plugin}</span>
                <span className="text-gray-600">in</span>
                <span className="truncate">{skill.marketplaceName || skill.marketplace}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Install Button */}
            {isInstalled ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-sm rounded-md">
                <Check className="w-4 h-4" />
                Installed
              </span>
            ) : (
              <button
                onClick={() => onInstall?.(skill)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add to Agent
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Description */}
          <div className="px-6 py-4 border-b border-gray-800/50">
            <p className="text-sm text-gray-300">
              {skill.description || 'No description available'}
            </p>
          </div>

          {/* Metadata */}
          <div className="px-6 py-4 border-b border-gray-800/50 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Skill ID */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Skill ID</label>
              <button
                onClick={handleCopyId}
                className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-gray-200 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[120px]">{skill.id}</span>
                  </>
                )}
              </button>
            </div>

            {/* Author */}
            {skill.author && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Author</label>
                <div className="flex items-center gap-1.5 text-sm text-gray-300">
                  <User className="w-3.5 h-3.5" />
                  <span>{skill.author}</span>
                </div>
              </div>
            )}

            {/* Version */}
            {skill.version && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Version</label>
                <div className="text-sm text-gray-300">{skill.version}</div>
              </div>
            )}

            {/* User Invocable */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Invocable</label>
              <div className="flex items-center gap-1.5 text-sm">
                {skill.userInvocable ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Code className="w-3.5 h-3.5" />
                    Yes (/{skill.name})
                  </span>
                ) : (
                  <span className="text-gray-500">No</span>
                )}
              </div>
            </div>
          </div>

          {/* Allowed Tools */}
          {skill.allowedTools && skill.allowedTools.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-800/50">
              <label className="text-xs text-gray-500 mb-2 block flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Allowed Tools
              </label>
              <div className="flex flex-wrap gap-1.5">
                {skill.allowedTools.map(tool => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded-md"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* SKILL.md Content */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                SKILL.md Content
              </label>
              {loading && (
                <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
              )}
            </div>

            {error ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            ) : loading ? (
              <div className="p-4 bg-gray-800/50 rounded-lg text-gray-500 text-sm text-center">
                Loading skill content...
              </div>
            ) : (
              <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
                <pre className="p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
                  {content || skill.content || 'No content available'}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-gray-500">
            Path: <code className="text-gray-400">{skill.path}</code>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
