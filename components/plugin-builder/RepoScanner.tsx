'use client'

import { useState, useRef, useEffect } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'

interface RepoScannerProps {
  onSkillsFound: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  selectedSkillKeys: Set<string>
}

export default function RepoScanner({ onSkillsFound, onAddSkill, selectedSkillKeys }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('main')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  // Track the exact url/ref that produced the current scanResult so that
  // handleAddSkill always sends the correct repository coordinates even if
  // the user edits the inputs after a scan completes.
  const [scannedUrl, setScannedUrl] = useState('')
  const [scannedRef, setScannedRef] = useState('main')
  const abortRef = useRef<AbortController | null>(null)

  // Invalidate stale scan results whenever the user changes either input field
  // or the parent provides a new onSkillsFound callback. This prevents skills
  // from a prior scan from being rendered (and potentially added) with
  // mismatched url/ref values or a stale callback.
  useEffect(() => {
    setScanResult(null)
  }, [url, ref, onSkillsFound])

  const handleScan = async () => {
    // Normalise inputs once so the API request and the stored scannedUrl/Ref
    // are always identical — preventing a mismatch where the API received an
    // untrimmed/whitespace ref while scannedRef stored the trimmed version.
    const trimmedUrl = url.trim()
    const trimmedRef = ref.trim() || 'main'

    if (!trimmedUrl) return

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
        body: JSON.stringify({ url: trimmedUrl, ref: trimmedRef }),
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
        setScannedUrl(trimmedUrl)
        setScannedRef(trimmedRef)
        onSkillsFound(data.skills, trimmedUrl, trimmedRef)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      // Always reset scanning state — the AbortError early-return in catch
      // does not clear it, so without this the button would remain stuck in
      // the spinner/disabled state if a scan is aborted with no new one
      // immediately following.
      setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    // Use the url/ref that were active when the scan completed, not the
    // current input values, which may have been edited since.
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
            // Build the key from scannedUrl/scannedRef (the coordinates that
            // were used for this scan) so that it always matches the key the
            // parent stored in selectedSkillKeys when onAddSkill was called.
            // The ref is included so that skills from different branches of the
            // same repo are treated as distinct entries (matching getSkillKey).
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
