/**
 * Skill Card Component
 *
 * Displays a single skill in the marketplace browser.
 * Shows skill name, description, source, and actions.
 */

'use client'

import {
  Package,
  Plus,
  Check,
  ExternalLink,
  Zap,
  Code
} from 'lucide-react'
import type { MarketplaceSkill } from '@/types/marketplace'

interface SkillCardProps {
  skill: MarketplaceSkill
  isInstalled?: boolean
  onInstall?: (skill: MarketplaceSkill) => void
  onViewDetails?: (skill: MarketplaceSkill) => void
  disabled?: boolean
}

export default function SkillCard({
  skill,
  isInstalled = false,
  onInstall,
  onViewDetails,
  disabled = false
}: SkillCardProps) {
  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!disabled && !isInstalled && onInstall) {
      onInstall(skill)
    }
  }

  return (
    <div
      onClick={() => onViewDetails?.(skill)}
      className={`
        group bg-gray-900/50 rounded-lg border border-gray-800
        hover:border-gray-700 hover:bg-gray-900/70
        transition-all duration-200 cursor-pointer
        ${disabled ? 'opacity-50' : ''}
      `}
    >
      {/* Header */}
      <div className="p-4 pb-3 border-b border-gray-800/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-blue-500/10 rounded-md flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-200 truncate">
                {skill.name}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                {skill.plugin}
              </p>
            </div>
          </div>

          {/* Install/Installed Badge */}
          {isInstalled ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-md flex-shrink-0">
              <Check className="w-3 h-3" />
              Installed
            </span>
          ) : (
            <button
              onClick={handleInstall}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs rounded-md transition-colors flex-shrink-0 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="p-4 pt-3">
        <p className="text-xs text-gray-400 line-clamp-2 mb-3">
          {skill.description || 'No description available'}
        </p>

        {/* Metadata Row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-gray-500">
            <Package className="w-3 h-3" />
            <span className="truncate max-w-[120px]">
              {skill.marketplaceName || skill.marketplace}
            </span>
          </div>

          {/* User Invocable Badge */}
          {skill.userInvocable && (
            <span className="flex items-center gap-1 text-amber-400/70">
              <Code className="w-3 h-3" />
              Invocable
            </span>
          )}
        </div>

        {/* Allowed Tools */}
        {skill.allowedTools && skill.allowedTools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skill.allowedTools.slice(0, 3).map(tool => (
              <span
                key={tool}
                className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded"
              >
                {tool}
              </span>
            ))}
            {skill.allowedTools.length > 3 && (
              <span className="px-1.5 py-0.5 text-gray-500 text-[10px]">
                +{skill.allowedTools.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* View Details Indicator */}
      <div className="px-4 pb-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <ExternalLink className="w-3 h-3" />
          View details
        </div>
      </div>
    </div>
  )
}
