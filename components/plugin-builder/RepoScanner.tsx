'use client'

import { useState, useRef } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus, Check } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'
import { getSkillKey } from './SkillPicker'

interface RepoScannerProps {
  onSkillsFound: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  onRemoveSkill: (key: string) => void
  selectedSkillKeys: Set<string>
}

export default function RepoScanner({ onSkillsFound, onAddSkill, onRemoveSkill, selectedSkillKeys }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('main')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  // Store the url/ref actually used for the last successful scan so that
  // handleAddSkill always references the coordinates that produced the results,
  // not whatever the user may have typed in the inputs since the scan ran.
  const [scannedUrl, setScannedUrl] = useState('')
  const [scannedRef, setScannedRef] = useState('main')
  const abortRef = useRef<AbortController | null>(null)

  const handleScan = async () => {
    if (!url.trim()) return

    // Abort any in-flight scan
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setScanning(true)
    setError(null)
    setScanResult(null)

    try {
      // Default an empty ref to 'main' so the API body and scannedRef always
      // agree on the effective ref value (the input field uses 'main' as its
      // placeholder, communicating this same default to the user).
      const resolvedUrl = url.trim()
      const resolvedRef = ref.trim() || 'main'

      const res = await fetch('/api/plugin-builder/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: resolvedUrl, ref: resolvedRef }),
        signal,
      })

      if (!res.ok) {
        const data = await res.json()
        if (!signal.aborted) setError(data.error || 'Failed to scan repository')
        return
      }

      const data: RepoScanResult = await res.json()
      if (!signal.aborted) {
        // Capture the exact url/ref that produced these results before any
        // subsequent user edits can change the input fields.
        setScanResult(data)
        setScannedUrl(resolvedUrl)
        setScannedRef(resolvedRef)
        onSkillsFound(data.skills, resolvedUrl, resolvedRef)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      if (!signal.aborted) setScanning(false)
    }
  }

  const handleToggleSkill = (skill: RepoSkillInfo, isSelected: boolean, key: string) => {
    if (isSelected) {
      // Use the canonical key so removal always targets the right selection entry.
      onRemoveSkill(key)
    } else {
      // Use scannedUrl/scannedRef (set on the last successful scan) so the skill
      // always carries the coordinates that match the displayed results, even if
      // the user has since edited the url/ref input fields.
      onAddSkill({
        type: 'repo',
        url: scannedUrl,
        ref: scannedRef,
        skillPath: skill.path,
        name: skill.name,
      })
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        Add from GitHub
      </h3>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Branch (main)"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <button
            onClick={handleScan}
            disabled={scanning || !url.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {scanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Scan
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {scanResult && scanResult.skills.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Found {scanResult.skills.length} skill{scanResult.skills.length !== 1 ? 's' : ''}
          </p>
          {scanResult.skills.map((skill) => {
            // Use getSkillKey so the key is always in sync with the canonical
            // format defined in SkillPicker, regardless of future format changes.
            const key = getSkillKey({ type: 'repo', url: scannedUrl, ref: scannedRef, skillPath: skill.path, name: skill.name })
            const isSelected = selectedSkillKeys.has(key)
            return (
              <div
                key={key}
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-gray-700/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200 truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-gray-500 truncate">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleSkill(skill, isSelected, key)}
                  className={`ml-2 p-1.5 rounded-md transition-colors flex-shrink-0 ${
                    isSelected
                      ? 'text-cyan-400 hover:bg-cyan-500/10'
                      : 'text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-400'
                  }`}
                  title={isSelected ? 'Remove skill' : 'Add skill'}
                  aria-pressed={isSelected}
                >
                  {isSelected ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {scanResult && scanResult.skills.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-2">
          No skills found in this repository.
        </p>
      )}
    </div>
  )
}
