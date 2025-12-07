'use client'

import { useState, useEffect } from 'react'
import { ArrowUpCircle, X, ExternalLink } from 'lucide-react'
import localVersion from '../version.json'

// URL to fetch latest version from GitHub raw content
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/version.json'

interface VersionInfo {
  version: string
  releaseDate?: string
  changelog?: string
}

/**
 * Compare two semver-like version strings
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  return 0
}

export function VersionChecker() {
  const [remoteVersion, setRemoteVersion] = useState<VersionInfo | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  const currentVersion = localVersion.version

  useEffect(() => {
    // Check if user has dismissed this version update
    const dismissedVersion = localStorage.getItem('ai-maestro-dismissed-version')

    // Fetch remote version - fail silently if no internet
    const checkVersion = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

        const response = await fetch(REMOTE_VERSION_URL, {
          signal: controller.signal,
          cache: 'no-store'
        })
        clearTimeout(timeoutId)

        if (!response.ok) return

        const data: VersionInfo = await response.json()
        setRemoteVersion(data)

        // Check if remote version is newer
        if (compareVersions(data.version, currentVersion) > 0) {
          // Only show if not dismissed for this specific version
          if (dismissedVersion !== data.version) {
            setUpdateAvailable(true)
          } else {
            setDismissed(true)
          }
        }
      } catch {
        // Silently ignore errors (no internet, timeout, etc.)
        // Local-only environments should work fine
      }
    }

    // Check version after a short delay to not block initial render
    const timer = setTimeout(checkVersion, 2000)
    return () => clearTimeout(timer)
  }, [currentVersion])

  const handleDismiss = () => {
    if (remoteVersion) {
      localStorage.setItem('ai-maestro-dismissed-version', remoteVersion.version)
    }
    setUpdateAvailable(false)
    setDismissed(true)
  }

  const handleShowUpdate = () => {
    setShowUpdateModal(true)
  }

  return (
    <>
      {/* Version display with optional update badge */}
      <span className="inline-flex items-center gap-2">
        <span>Version {currentVersion}</span>

        {updateAvailable && !dismissed && (
          <button
            onClick={handleShowUpdate}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-full transition-colors animate-pulse"
            title={`Update available: v${remoteVersion?.version}`}
          >
            <ArrowUpCircle className="w-3 h-3" />
            <span>v{remoteVersion?.version}</span>
          </button>
        )}
      </span>

      {/* Update Modal */}
      {showUpdateModal && remoteVersion && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowUpdateModal(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-6 h-6 text-green-500" />
                <h2 className="text-xl font-semibold text-white">Update Available</h2>
              </div>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Current version:</span>
                <span className="text-white font-mono">{currentVersion}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Latest version:</span>
                <span className="text-green-400 font-mono">{remoteVersion.version}</span>
              </div>
              {remoteVersion.releaseDate && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Released:</span>
                  <span className="text-white">{remoteVersion.releaseDate}</span>
                </div>
              )}

              <div className="border-t border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-white mb-2">How to update:</h3>
                <div className="bg-gray-800 rounded p-3 font-mono text-sm text-gray-300">
                  <p className="text-gray-500 mb-2"># Navigate to AI Maestro directory</p>
                  <p>cd /path/to/ai-maestro</p>
                  <p className="text-gray-500 mt-2 mb-2"># Pull latest and update</p>
                  <p>./update-aimaestro.sh</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {remoteVersion.changelog && (
                  <a
                    href={remoteVersion.changelog}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Changelog
                  </a>
                )}
                <button
                  onClick={() => {
                    handleDismiss()
                    setShowUpdateModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                >
                  Remind Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
