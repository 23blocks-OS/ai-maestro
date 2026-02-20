'use client'

import { Crown, Shield, Plus } from 'lucide-react'
import type { GovernanceRole } from '@/hooks/useGovernance'
export type { GovernanceRole }

interface RoleBadgeProps {
  role: GovernanceRole
  onClick?: () => void
  size?: 'sm' | 'md'
}

export default function RoleBadge({ role, onClick, size = 'md' }: RoleBadgeProps) {
  // Size classes for badge dimensions
  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5 gap-1'
    : 'text-sm px-3 py-1 gap-1.5'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  // Helper to render a badge element as button (if clickable) or span (if static)
  const renderBadge = (classes: string, content: React.ReactNode) => {
    return onClick ? (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    ) : (
      <span className={classes}>
        {content}
      </span>
    )
  }

  switch (role) {
    case 'manager': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
            bg-amber-500/20 text-amber-300 border-amber-500/30
            ${onClick ? 'hover:bg-amber-500/30 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Crown className={iconSize} />MANAGER</>)
    }

    case 'chief-of-staff': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
            bg-indigo-500/20 text-indigo-300 border-indigo-500/30
            ${onClick ? 'hover:bg-indigo-500/30 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Shield className={iconSize} />CHIEF-OF-STAFF</>)
    }

    case 'member': {
      // Member agents only show "Assign Role" button when clickable
      if (!onClick) return null
      return (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center ${sizeClasses} rounded-full border border-dashed font-medium transition-colors
            border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400 cursor-pointer`}
        >
          <Plus className={iconSize} />
          Assign Role
        </button>
      )
    }

    default: {
      // Exhaustive role handling — unknown roles show as 'Member' by default
      // Fallback for any future role values not yet handled explicitly
      const displayLabel = (role as string).toUpperCase()
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
            bg-gray-500/20 text-gray-300 border-gray-500/30
            ${onClick ? 'hover:bg-gray-500/30 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Shield className={iconSize} />{displayLabel}</>)
    }
  }
}
