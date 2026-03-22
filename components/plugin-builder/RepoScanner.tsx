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
  // Track the url/ref values that were actually used for the most recent successful scan,
  // so that handleAddSkill and the selection key always reflect the scanned state rather
  // than the current (potentially edited) input values.
  const [scannedUrl, setScannedUrl] = useState('')
  const [scannedRef, setScannedRef] = useState('main')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight scan when the component unmounts to prevent resource leaks.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleScan = async () => {
    if (!url.trim()) return

    // Capture the url/ref values at the moment the scan is initiated so that
    // async continuations always operate on the same values that were sent to
    // the server, regardless of whether the user edits the inputs while the
    // request is in flight.
    const trimmedUrl = url.trim()
    // Default to 'main' if the user left the ref input empty (ref state may be
    // '' for a brief moment before onChange normalises it to 'main').
    const scannedRefSnapshot = ref.trim() || 'main'

    // Abort any in-flight scan
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setScanning(true)
    setError(null)
    setScanResult(null)
    // Clear the previous scan's url/ref so that if this attempt fails, stale values
    // from the prior successful scan cannot be used by handleAddSkill or key checks.
    setScannedUrl('')
    setScannedRef('')

    try {
      const res = await fetch('/api/plugin-builder/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl, ref: scannedRefSnapshot }),
        signal,
      })

      if (!res.ok) {
        const data = await res.json()
        if (!signal.aborted) setError(data.error || 'Failed to scan repository')
        return
      }

      const data: RepoScanResult = await res.json()
      if (!signal.aborted) {
        // Snapshot the exact url/ref used for this scan so subsequent
        // handleAddSkill calls and selection key checks stay consistent
        // even if the user edits the inputs after scanning.
        setScannedUrl(trimmedUrl)
        setScannedRef(scannedRefSnapshot)
        setScanResult(data)
        // Pass the ref value captured at scan-start, not the current `ref`
        // state which may have been changed by the user during the async fetch.
        onSkillsFound(data.skills, trimmedUrl, scannedRefSnapshot)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to connect to server')
    } finally {
      // Always clear scanning state — a new scan will immediately set it back
      // to true, so resetting here even after an abort is safe and correct.
      setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    // Use the url/ref captured at scan time, not the current input values,
    // to guarantee the added skill matches what was actually scanned.
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
            onChange={(e) => {
              const newRef = e.target.value.trim()
              setRef(newRef || 'main')
            }}
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
            // Key must match what the parent computed from the scan-time url,
            // not the current (possibly edited) input value.
            const key = `repo:${scannedUrl}:${skill.path}`
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
