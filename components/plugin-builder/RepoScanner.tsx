'use client'

import { useState, useRef, useEffect } from 'react'
import { GitBranch, Search, Loader2, AlertCircle, Plus } from 'lucide-react'
import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'

interface RepoScannerProps {
  // NT-020: Made optional -- SkillPicker doesn't use the callback (passes no-op)
  onSkillsFound?: (skills: RepoSkillInfo[], url: string, ref: string) => void
  onAddSkill: (skill: PluginSkillSelection) => void
  onRemoveSkill: (key: string) => void
  selectedSkillKeys: Set<string>
  // Canonical key function from SkillPicker — ensures key format never diverges
  getSkillKey: (skill: PluginSkillSelection) => string
}

export default function RepoScanner({ onSkillsFound, onAddSkill, selectedSkillKeys, getSkillKey }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  // Empty string means "use default"; the actual default 'main' is applied only at scan time
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
  // Track the exact url/ref used for the last successful scan so that handleAddSkill
  // always stores the values that were actually used to discover each skill, even if
  // the user later edits the input fields without re-scanning.
  const [lastScannedUrl, setLastScannedUrl] = useState<string | null>(null)
  const [lastScannedRef, setLastScannedRef] = useState<string | null>(null)

  // NT-006: Abort any in-flight scan on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Abort any in-flight fetch when the component unmounts to prevent state updates on
  // an unmounted component and to release network resources immediately.
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Clear stale results whenever the user changes the url or ref inputs so that
  // the displayed skill list can never belong to a different repository than what
  // the current inputs describe.
  useEffect(() => {
    setScanResult(null)
    setError(null)
  }, [url, ref])

  // Abort any in-flight scan when the component unmounts to prevent resource leaks.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleScan = async () => {
    if (!url.trim()) return

    // Capture url/ref at scan initiation so that any user edits during the async
    // fetch do not corrupt the values passed to onSkillsFound or stored as the
    // "scanned" coordinates for handleAddSkill.
    const currentUrl = url.trim()
    // Apply the 'main' default here rather than in the onChange handler so the
    // input field can remain empty while the user is typing, without snapping back.
    const currentRef = ref || 'main'

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

    // Normalise ref: trim whitespace and fall back to 'main' if empty.
    const trimmedUrl = url.trim()
    const trimmedRef = ref.trim() || 'main'

    // Resolve the ref to use: fall back to 'main' when the field is blank,
    // matching the input's onChange default so the API always receives a valid ref.
    const actualRef = ref.trim() || 'main'
    try {
      // Apply the 'main' default only at the point of the network call so that
      // the input field can be truly empty (controlled by the user) while still
      // sending a valid ref to the API. Calculate once and reuse to avoid
      // inconsistency between the fetch body, stored state, and the callback.
      const effectiveRef = ref.trim() || 'main'
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
        // Capture the exact url/ref used for this scan before storing results so
        // subsequent input edits cannot corrupt skill keys or onAddSkill payloads.
        setScannedUrl(url.trim())
        setScannedRef(ref)
        setScanResult(data)
        // Store the exact values used so handleAddSkill is always consistent with this scan
        setLastScannedUrl(url.trim())
        setLastScannedRef(effectiveRef)
        onSkillsFound?.(data.skills, url.trim(), effectiveRef)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!signal.aborted) setError('Failed to connect to server')
    } finally {
      // Always reset scanning state regardless of abort, to avoid stuck UI
      setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    // Use the url/ref captured at scan time, not the current input values, so that
    // editing the fields after a scan does not corrupt the stored skill reference.
    // lastScannedUrl and lastScannedRef are guaranteed non-null when scanResult is present,
    // because handleScan sets them atomically with setScanResult on every successful scan.
    onAddSkill({
      type: 'repo',
      url: lastScannedUrl!,
      ref: lastScannedRef!,
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
            // Use the exact url/ref captured at scan time so this key always
            // matches the one produced by getSkillKey (repo:url:ref:skillPath).
            // lastScannedUrl and lastScannedRef are guaranteed non-null here because
            // scanResult is only set after a successful scan that also sets both values.
            const key = `repo:${lastScannedUrl}:${lastScannedRef}:${skill.path}`
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
                  onClick={() => isSelected ? onRemoveSkill(key) : handleAddSkill(skill)}
                  className="ml-2 p-1.5 rounded-md text-cyan-400 hover:bg-cyan-500/10 transition-colors flex-shrink-0"
                  title={isSelected ? 'Remove skill' : 'Add skill'}
                >
                  <Plus className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-45' : ''}`} />
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
