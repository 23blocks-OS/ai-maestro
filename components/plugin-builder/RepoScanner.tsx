'use client'

import { useState, useRef, useEffect } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus, Check } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'

interface RepoScannerProps {
  onSkillsFound: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  // Allows the user to deselect a repo skill that was previously added
  onRemoveSkill: (key: string) => void
  selectedSkillKeys: Set<string>
}

export default function RepoScanner({ onSkillsFound, onAddSkill, onRemoveSkill, selectedSkillKeys }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('main')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  // Tracks the URL that was actually scanned — distinct from `url` state which
  // may be edited by the user after a successful scan without a rescan.
  const [scannedUrl, setScannedUrl] = useState<string | null>(null)
  // Tracks the ref that was actually scanned for the same reason as scannedUrl.
  const [scannedRef, setScannedRef] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight fetch when the component unmounts to avoid resource leaks.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Clear stale scan results whenever the user changes the URL or ref, so the
  // displayed skills always correspond to the currently-entered coordinates.
  // Also abort any in-flight scan and reset the scanning flag so the button
  // is re-enabled immediately rather than left stuck with its spinner.
  useEffect(() => {
    setScanResult(null)
    setError(null)
    setScanning(false)
    setScannedUrl(null)
    setScannedRef(null)
    abortRef.current?.abort()
  }, [url, ref])

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
        // Record the exact coordinates used for this scan so key generation
        // remains stable even if the user edits the inputs after a scan.
        setScannedUrl(url.trim())
        setScannedRef(ref)
        onSkillsFound(data.skills, url.trim(), ref)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      // Always reset scanning state; result/error updates above are already
      // guarded with !signal.aborted, so the spinner is never left stuck.
      setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    // Use scannedUrl/scannedRef so the PluginSkillSelection coordinates match
    // the key generated in the map below — both must agree for isSelected to
    // work correctly.  scannedUrl/scannedRef are non-null whenever a skill
    // card is visible (scan must have completed successfully to show them).
    onAddSkill({
      type: 'repo',
      url: scannedUrl!,
      ref: scannedRef!,
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
              onChange={(e) => setUrl(e.target.value.trim())}
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
            onChange={(e) => setRef(e.target.value.trim() || 'main')}
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
            // Use scannedUrl/scannedRef (the coordinates actually scanned) so
            // keys stay stable even if the user edits the inputs after a scan.
            // Include ref so skills from the same URL on different branches
            // never collide (must match the getSkillKey format in SkillPicker).
            const key = `repo:${scannedUrl}:${scannedRef}:${skill.path}`
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
                {/* Toggle: remove when selected, add when not — mirrors core/marketplace skill UX */}
                <button
                  onClick={() => isSelected ? onRemoveSkill(key) : handleAddSkill(skill)}
                  className={`ml-2 p-1.5 rounded-md transition-colors flex-shrink-0 ${
                    isSelected
                      ? 'text-cyan-400 hover:bg-cyan-500/10'
                      : 'text-cyan-400 hover:bg-cyan-500/10'
                  }`}
                  title={isSelected ? 'Remove skill' : 'Add skill'}
                  aria-pressed={isSelected}
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
