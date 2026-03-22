'use client'

import { useState, useRef } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'

interface RepoScannerProps {
  onSkillsFound: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  selectedSkillKeys: Set<string>
  // Canonical key function from SkillPicker — ensures key format never diverges
  getSkillKey: (skill: PluginSkillSelection) => string
}

export default function RepoScanner({ onSkillsFound, onAddSkill, selectedSkillKeys, getSkillKey }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  // ref defaults to empty string; the backend uses the repo's default branch when empty
  const [ref, setRef] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  // store the url/ref that produced the current scanResult so that handleAddSkill and
  // the selectedSkillKeys lookup always use the values from the scan, not from current input state.
  // Empty string means no scan has been performed yet; url.trim() is always non-empty before a scan.
  const [scannedUrl, setScannedUrl] = useState<string>('')
  // Always a string (empty string = use repo default branch); never null after a successful scan
  const [scannedRef, setScannedRef] = useState<string>('')
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
    // Reset scanned url/ref so handleAddSkill never uses stale data from a previous scan
    setScannedUrl('')
    setScannedRef('')

    try {
      const res = await fetch('/api/plugin-builder/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ref }),
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
        // Capture the exact url/ref used for this scan so handleAddSkill is never stale
        setScannedUrl(url.trim())
        setScannedRef(ref)
        onSkillsFound(data.skills, url.trim(), ref)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      if (!signal.aborted) setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    // Use the url/ref that were in effect when the scan ran, not the current input state
    // scannedRef is always a string (empty string means use repo default branch)
    if (!scannedUrl) return
    onAddSkill({
      type: 'repo',
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

      {scanResult && scanResult.skills.length > 0 && scannedUrl && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Found {scanResult.skills.length} skill{scanResult.skills.length !== 1 ? 's' : ''}
          </p>
          {scanResult.skills.map((skill) => {
            // Use getSkillKey (passed from SkillPicker) so the key format never diverges from
            // how keys are generated when a skill is added. scannedUrl is always a non-empty
            // string here because the outer guard checks `scannedUrl !== ''` (via truthiness).
            const key = getSkillKey({ type: 'repo', url: scannedUrl, ref: scannedRef, skillPath: skill.path, name: skill.name })
            const isSelected = selectedSkillKeys.has(key)
            return (
              <div
                key={skill.path}
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-gray-700/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200 truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-gray-500 truncate">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddSkill(skill)}
                  disabled={isSelected}
                  className="ml-2 p-1.5 rounded-md text-cyan-400 hover:bg-cyan-500/10 disabled:text-gray-600 disabled:hover:bg-transparent transition-colors flex-shrink-0"
                  title={isSelected ? 'Already added' : 'Add skill'}
                >
                  <Plus className="w-4 h-4" />
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
