'use client'

import { useState, useEffect } from 'react'
import { X, User, Users, Bot } from 'lucide-react'

interface AvatarPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (avatarUrl: string) => void
  currentAvatar?: string
  usedAvatars: string[]
}

type AvatarCategory = 'men' | 'women' | 'robots'

// Number of avatars available for each category
const AVATAR_COUNTS: Record<AvatarCategory, number> = {
  men: 100,
  women: 100,
  robots: 45
}

export default function AvatarPicker({
  isOpen,
  onClose,
  onSelect,
  currentAvatar,
  usedAvatars
}: AvatarPickerProps) {
  const [activeTab, setActiveTab] = useState<AvatarCategory>('men')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)

  // Reset selection when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedAvatar(null)
      // Default to the tab matching current avatar
      if (currentAvatar?.includes('/women') || currentAvatar?.includes('women_')) {
        setActiveTab('women')
      } else if (currentAvatar?.includes('/robots') || currentAvatar?.includes('robots_')) {
        setActiveTab('robots')
      } else {
        setActiveTab('men')
      }
    }
  }, [isOpen, currentAvatar])

  if (!isOpen) return null

  // Helper to normalize avatar paths for comparison (handles both old randomuser URLs and new local paths)
  const normalizeAvatarPath = (avatar: string | undefined): string | undefined => {
    if (!avatar) return undefined
    // Convert randomuser.me URL to local path format for comparison
    const match = avatar.match(/portraits\/(men|women)\/(\d+)\.jpg/)
    if (match) {
      return `/avatars/${match[1]}_${match[2].padStart(2, '0')}.png`
    }
    return avatar
  }

  const usedAvatarsNormalized = new Set(usedAvatars.map(a => normalizeAvatarPath(a)))
  const currentAvatarNormalized = normalizeAvatarPath(currentAvatar)

  // Generate avatar URLs for the selected category using local library
  const avatarCount = AVATAR_COUNTS[activeTab]
  const avatars = Array.from({ length: avatarCount }, (_, i) => {
    const url = `/avatars/${activeTab}_${i.toString().padStart(2, '0')}.png`
    return {
      url,
      index: i,
      isUsed: usedAvatarsNormalized.has(url),
      isCurrent: currentAvatarNormalized === url
    }
  })

  const handleSelect = () => {
    if (selectedAvatar) {
      onSelect(selectedAvatar)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Choose Avatar</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('men')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'men'
                ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <User className="w-4 h-4" />
            Men
          </button>
          <button
            onClick={() => setActiveTab('women')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'women'
                ? 'bg-pink-600/20 text-pink-400 border-b-2 border-pink-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Women
          </button>
          <button
            onClick={() => setActiveTab('robots')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'robots'
                ? 'bg-emerald-600/20 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Bot className="w-4 h-4" />
            Robots
          </button>
        </div>

        {/* Avatar Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 sm:grid-cols-10 gap-3">
            {avatars.map(({ url, index, isUsed, isCurrent }) => {
              const isSelected = selectedAvatar === url
              const isDisabled = isUsed && !isCurrent

              return (
                <button
                  key={index}
                  onClick={() => !isDisabled && setSelectedAvatar(url)}
                  disabled={isDisabled}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden transition-all
                    ${isDisabled
                      ? 'opacity-30 cursor-not-allowed grayscale'
                      : 'hover:scale-105 cursor-pointer'
                    }
                    ${isSelected
                      ? 'ring-4 ring-blue-500 scale-105'
                      : ''
                    }
                    ${isCurrent && !isSelected
                      ? 'ring-2 ring-green-500'
                      : ''
                    }
                  `}
                  title={isDisabled ? 'Already in use by another agent' : isCurrent ? 'Current avatar' : `Avatar ${index + 1}`}
                >
                  <img
                    src={url}
                    alt={`Avatar ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isDisabled && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-xs text-gray-300">In use</span>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute bottom-0 left-0 right-0 bg-green-600/90 text-white text-xs py-0.5 text-center">
                      Current
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800/50">
          <p className="text-sm text-gray-400">
            {selectedAvatar
              ? 'Click "Apply" to use this avatar'
              : 'Select an avatar from the grid above'
            }
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedAvatar}
              className={`
                px-6 py-2 rounded-lg font-medium transition-all
                ${selectedAvatar
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
