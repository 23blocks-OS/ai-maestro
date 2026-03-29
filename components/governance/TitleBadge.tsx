'use client'

import { Crown, Megaphone, Shield, Plus, Compass, GitMerge } from 'lucide-react'
import type { GovernanceTitle } from '@/hooks/useGovernance'
export type { GovernanceTitle }

interface TitleBadgeProps {
  title: GovernanceTitle
  onClick?: () => void
  size?: 'sm' | 'md'
}

export default function TitleBadge({ title, onClick, size = 'md' }: TitleBadgeProps) {
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

  switch (title) {
    case 'manager': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider transition-colors
            bg-red-500/15 text-red-400 border-red-500/30
            ${onClick ? 'hover:bg-red-500/25 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Crown className={iconSize} />MANAGER</>)
    }

    case 'chief-of-staff': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider transition-colors
            bg-yellow-500/15 text-yellow-400 border-yellow-500/30
            ${onClick ? 'hover:bg-yellow-500/25 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Shield className={iconSize} />CHIEF-OF-STAFF</>)
    }

    case 'orchestrator': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider transition-colors
            bg-blue-500/15 text-blue-400 border-blue-500/30
            ${onClick ? 'hover:bg-blue-500/25 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Megaphone className={iconSize} />ORCHESTRATOR</>)
    }

    case 'architect': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider transition-colors
            bg-purple-500/15 text-purple-400 border-purple-500/30
            ${onClick ? 'hover:bg-purple-500/25 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Compass className={iconSize} />ARCHITECT</>)
    }

    case 'integrator': {
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider transition-colors
            bg-cyan-500/15 text-cyan-400 border-cyan-500/30
            ${onClick ? 'hover:bg-cyan-500/25 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><GitMerge className={iconSize} />INTEGRATOR</>)
    }

    case 'member': {
      if (onClick) {
        // Clickable: show "ASSIGN TITLE" button (all caps like all governance titles)
        return (
          <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center ${sizeClasses} rounded-full border border-dashed font-bold tracking-wider transition-colors uppercase
              border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400 cursor-pointer`}
          >
            <Plus className={iconSize} />
            ASSIGN TITLE
          </button>
        )
      }
      // Read-only: show MEMBER label
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-bold tracking-wider
            bg-gray-500/10 text-gray-400 border-gray-500/25 cursor-default`
      return <span className={classes}>MEMBER</span>
    }

    default: {
      // NT-022: Exhaustiveness check — if all GovernanceTitle variants are handled above,
      // this line will cause a compile-time error when a new variant is added but not handled.
      const _exhaustive: never = title
      // Fallback for any future title values not yet handled explicitly.
      // CC-P1-708: Use String() instead of `as string` to convert the exhausted `never` type safely.
      const displayLabel = String(_exhaustive).toUpperCase()
      const classes = `inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
            bg-gray-500/20 text-gray-300 border-gray-500/30
            ${onClick ? 'hover:bg-gray-500/30 cursor-pointer' : 'cursor-default'}`
      return renderBadge(classes, <><Shield className={iconSize} />{displayLabel}</>)
    }
  }
}
