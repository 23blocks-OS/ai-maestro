'use client'

import { Crown, Shield, Plus } from 'lucide-react'

export type GovernanceRole = 'manager' | 'chief-of-staff' | 'normal'

interface RoleBadgeProps {
  role: GovernanceRole
  onClick?: () => void
  size?: 'sm' | 'md'
}

export default function RoleBadge({ role, onClick, size = 'md' }: RoleBadgeProps) {
  // Size classes
  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5 gap-1'
    : 'text-sm px-3 py-1 gap-1.5'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  if (role === 'manager') {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
          bg-amber-500/20 text-amber-300 border-amber-500/30
          ${onClick ? 'hover:bg-amber-500/30 cursor-pointer' : 'cursor-default'}`}
      >
        <Crown className={iconSize} />
        MANAGER
      </button>
    )
  }

  if (role === 'chief-of-staff') {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center ${sizeClasses} rounded-full border font-medium transition-colors
          bg-indigo-500/20 text-indigo-300 border-indigo-500/30
          ${onClick ? 'hover:bg-indigo-500/30 cursor-pointer' : 'cursor-default'}`}
      >
        <Shield className={iconSize} />
        CHIEF-OF-STAFF
      </button>
    )
  }

  // role === 'normal'
  if (!onClick) return null  // Don't show anything for normal agents without onClick

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center ${sizeClasses} rounded-full border border-dashed font-medium transition-colors
        border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400 cursor-pointer`}
    >
      <Plus className={iconSize} />
      Assign Role
    </button>
  )
}
