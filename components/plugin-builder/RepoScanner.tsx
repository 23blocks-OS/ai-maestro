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
  const abortRef = useRef<AbortController | null>(null)

  // Clear stale scan results whenever the user changes the URL or ref so the
  // displayed skills always belong to the current inputs.
  useEffect(() => {
    setScanResult(null)
  }, [url, ref])

  // Abort any in-flight fetch when the component unmounts to prevent resource leaks.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleScan = async () => {
    if (!url.trim()) return

    // Capture inputs at scan-start so that a mid-flight input change cannot
    // associate the results with the wrong repository/branch (stale closure bug).
    const scanUrl = url.trim()
    const scanRef = ref.trim() || 'main' // Use 'main' if ref is empty, consistent with onChange defaulting

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
        // Use the captured values so the request body matches what we validate below.
        body: JSON.stringify({ url: scanUrl, ref: scanRef }),
        signal,
      })

      if (!res.ok) {
        const data = await res.json()
        if (!signal.aborted) setError(data.error || 'Failed to scan repository')
        return
      }

      const data: RepoScanResult = await res.json()
      // Guard against both abort and input changes that occurred while the fetch
      // was in flight — if the user changed url/ref the useEffect already cleared
      // scanResult, so applying stale results would re-introduce wrong skills.
      if (!signal.aborted && scanUrl === url.trim() && scanRef === (ref.trim() || 'main')) {
        setScanResult(data)
        onSkillsFound(data.skills, scanUrl, scanRef)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Guard state update so we don't call setState on an unmounted component
      // (component unmount triggers abort, but a concurrent network failure can
      // still reach here before the abort propagates).
      if (!signal.aborted) setError('Failed to connect to server')
    } finally {
      if (!signal.aborted) setScanning(false)
    }
  }

  const handleAddSkill = (skill: RepoSkillInfo) => {
    onAddSkill({
      type: 'repo',
      url: url.trim(),
      ref: ref.trim() || 'main', // Use 'main' if ref is empty, consistent with onChange and scan behaviour
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
            // Key must match exactly what the parent stores via onSkillsFound/onAddSkill:
            // both url and ref are trimmed there, and ref is included for uniqueness.
            const key = `repo:${url.trim()}:${ref.trim() || 'main'}:${skill.path}`
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
