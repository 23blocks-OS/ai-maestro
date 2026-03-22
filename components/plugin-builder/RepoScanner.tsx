'use client'

import { useState, useRef } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus, Check } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'
import { getSkillKey } from './SkillPicker'

interface RepoScannerProps {
  /** Called after a successful scan with the skills found, the repo URL, and the
   *  effective ref (always resolved — never an empty string). Optional: the parent
   *  may pass a no-op if it only relies on onAddSkill/onRemoveSkill to track
   *  which skills are selected. */
  onSkillsFound?: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  onRemoveSkill: (key: string) => void
  selectedSkillKeys: Set<string>
}

export default function RepoScanner({ onSkillsFound, onAddSkill, onRemoveSkill, selectedSkillKeys }: RepoScannerProps) {
  // onSkillsFound is optional — callers that only care about onAddSkill/onRemoveSkill
  // may omit it or pass a no-op without causing any issues.
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('main')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  // scannedUrl/scannedRef capture the values actually used for the last successful scan,
  // so that handleAddSkill and skill keys stay consistent even if the user edits the
  // URL/ref inputs after the scan completes.
  // scannedRef is initialised to 'main' (the same default as the ref input) so that
  // getSkillKey always receives a non-empty, well-defined effective branch name.
  const [scannedUrl, setScannedUrl] = useState('')
  const [scannedRef, setScannedRef] = useState('main')
  const abortRef = useRef<AbortController | null>(null)

  const handleScan = async () => {
    if (!url.trim()) return

    // Abort any in-flight scan
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    // Apply the default branch name here, at request time, so the input field
    // can remain empty (indicating "use default") without clobbering its display value.
    const effectiveRef = ref.trim() || 'main'

    setScanning(true)
    setError(null)
    setScanResult(null)

    try {
      const res = await fetch('/api/plugin-builder/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ref: effectiveRef }),
        signal,
      })

      if (!res.ok) {
        const data = await res.json()
        if (!signal.aborted) setError(data.error || 'Failed to scan repository')
        return
      }

      const data: RepoScanResult = await res.json()
      if (!signal.aborted) {
        setScanResult(data)
        // Capture the exact url/ref used for this scan so that handleAddSkill
        // and key computation stay consistent if the user edits the inputs later.
        const currentScannedUrl = url.trim()
        const currentScannedRef = effectiveRef
        setScannedUrl(currentScannedUrl)
        setScannedRef(currentScannedRef)
        // Notify the parent (if it provided the callback) with the same captured
        // values so both sides always agree on which url/ref were used for the scan.
        onSkillsFound?.(data.skills, currentScannedUrl, currentScannedRef)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      if (!signal.aborted) setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    onAddSkill({
      type: 'repo',
      // Use scannedUrl/scannedRef (the values used at scan time) rather than the
      // live url/ref state, which the user may have edited after the scan finished.
      url: scannedUrl,
      ref: scannedRef,
      skillPath: skill.path,
      name: skill.name,
    })
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
              onChange={(e) => { setUrl(e.target.value) }}
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
            // Build the canonical PluginSkillSelection shape so getSkillKey produces
            // a key identical to the one stored when handleAddSkill is called.
            const skillSelection: PluginSkillSelection = {
              type: 'repo',
              url: scannedUrl,
              ref: scannedRef,
              skillPath: skill.path,
              name: skill.name,
            }
            const key = getSkillKey(skillSelection)
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
                  onClick={() => {
                    if (isSelected) {
                      onRemoveSkill(key)
                    } else {
                      handleAddSkill(skill)
                    }
                  }}
                  className={`ml-2 p-1.5 rounded-md transition-colors flex-shrink-0 ${
                    isSelected
                      ? 'text-emerald-400 hover:bg-red-500/10 hover:text-red-400'
                      : 'text-cyan-400 hover:bg-cyan-500/10'
                  }`}
                  title={isSelected ? 'Remove skill' : 'Add skill'}
                >
                  {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
