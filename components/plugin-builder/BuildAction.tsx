'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Hammer, Loader2, Check, X, Copy, GitBranch, ChevronDown, ChevronUp } from 'lucide-react'
import type { PluginBuildConfig, PluginBuildResult } from '@/types/plugin-builder'

interface BuildActionProps {
  config: PluginBuildConfig
  disabled: boolean
  disabledReason?: string
}

/** Strip ANSI escape codes from build output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

export default function BuildAction({ config, disabled, disabledReason }: BuildActionProps) {
  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<PluginBuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [forkUrl, setForkUrl] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollFailures = useRef(0)
  // SF-022: AbortController for in-flight polling fetch requests
  const pollAbortRef = useRef<AbortController | null>(null)

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      // SF-022: Abort any in-flight poll fetch on unmount
      pollAbortRef.current?.abort()
    }
  }, [])

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    // SF-022: Abort any in-flight poll fetch when clearing.
    // Capture the ref in a local variable first, then abort, then null the ref.
    // Nulling before abort() would allow a concurrent clearPoll call to clear
    // the ref between our capture and the abort() call, leaving a fetch un-aborted.
    const abortCtrl = pollAbortRef.current
    abortCtrl?.abort()
    pollAbortRef.current = null
    pollFailures.current = 0
  }, [])

  // Clean up polling on unmount — use clearPoll() for consistent cleanup (resets failure counter too)
  useEffect(() => {
    return () => {
      clearPoll()
    }
  }, [clearPoll])

  const handleBuild = async () => {
    // Clear any existing poll interval first (prevents leak on rapid re-clicks)
    clearPoll()

    setBuilding(true)
    setResult(null)
    setError(null)
    setShowLogs(false)
    // Reset push result on new build, but keep the push panel open if it was already shown
    // so the user can immediately push after a rebuild without re-opening the panel
    setPushResult(null)

    try {
      const res = await fetch('/api/plugin-builder/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Build failed')
        setBuilding(false)
        return
      }

      const data: PluginBuildResult = await res.json()
      setResult(data)

      // Poll for completion
      if (data.status === 'building') {
        pollRef.current = setInterval(async () => {
          try {
            // SF-022: Create a local AbortController per tick so that each fetch
            // has its own signal. Assign it to pollAbortRef.current BEFORE the
            // fetch so that clearPoll() / unmount cleanup can abort it at any time.
            // If a new tick fires while this one is still awaiting, clearPoll() will
            // abort the current fetch via pollAbortRef.current before the ref is
            // replaced — preventing an un-abortable in-flight request.
            const tickAbortCtrl = new AbortController()
            pollAbortRef.current = tickAbortCtrl
            const statusRes = await fetch(`/api/plugin-builder/builds/${data.buildId}`, { signal: tickAbortCtrl.signal })
            // Clear the ref only if it still points to this tick's controller
            // (clearPoll may have already nulled it if abort was requested).
            if (pollAbortRef.current === tickAbortCtrl) {
              pollAbortRef.current = null
            }
            if (statusRes.ok) {
              pollFailures.current = 0
              // Wrap JSON parsing separately — a malformed response must not leave
              // the component stuck in `building` state indefinitely.
              try {
                const statusData: PluginBuildResult = await statusRes.json()
                setResult(statusData)

                if (statusData.status !== 'building') {
                  clearPoll()
                  setBuilding(false)
                  // Do NOT force showLogs to true — let the user expand logs manually.
                }
              } catch {
                pollFailures.current++
                if (pollFailures.current >= 5) {
                  clearPoll()
                  setResult(null)
                  setError('Lost connection to build server')
                  setBuilding(false)
                }
              }
            } else {
              // HTTP error (4xx/5xx): include status code in the error message
              pollFailures.current++
              if (pollFailures.current >= 5) {
                clearPoll()
                const errorData = await statusRes.json().catch(() => null)
                setResult(null)
                setError(errorData?.error || `Build status check failed: HTTP ${statusRes.status}`)
                setBuilding(false)
                return // Prevent further processing in this tick after stopping the poll
              }
            }
          } catch {
            // Network error or AbortError: fetch itself threw (no response received).
            // Clear the ref if it still belongs to this tick.
            pollAbortRef.current = null
            pollFailures.current++
            if (pollFailures.current >= 5) {
              clearPoll()
              setResult(null)
              setError('Lost connection to build server')
              setBuilding(false)
              return // Prevent further processing in this tick after stopping the poll
            }
          }
        }, 1000)
      } else {
        // Not entering polling state — ensure no stale interval reference remains
        clearPoll()
        setBuilding(false)
        // Do NOT force showLogs to true — let the user expand logs manually.
      }
    } catch {
      // clearPoll() was already called at the top of handleBuild before the fetch;
      // no interval can be running at this point, so no additional call is needed.
      setError('Failed to connect to server')
      setBuilding(false)
    }
  }

  const handlePush = async () => {
    // Guard: manifest must exist (forkUrl.trim() is already enforced by the button's disabled prop)
    if (!result?.manifest) return

    setPushing(true)
    setPushResult(null)

    // Client-side URL validation: require https://github.com/<owner>/<repo>[.git]
    // The .git suffix is optional but common; owner/repo segments must be non-empty.
    if (!forkUrl.trim().match(/^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/)) {
      setPushResult({ ok: false, message: 'URL must be an HTTPS GitHub repository URL (e.g. https://github.com/user/repo)' })
      setPushing(false)
      return
    }

    try {
      const res = await fetch('/api/plugin-builder/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forkUrl: forkUrl.trim(),
          manifest: result.manifest,
        }),
      })

      const data = await res.json()
      setPushResult({
        ok: res.ok,
        message: res.ok ? (data.message || 'Pushed successfully') : (data.error || 'Push failed'),
      })
    } catch {
      setPushResult({ ok: false, message: 'Failed to connect to server' })
    } finally {
      setPushing(false)
    }
  }

  const copyInstallCommand = () => {
    if (!result?.outputPath) return
    navigator.clipboard.writeText(`claude plugin install ${result.outputPath}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch((err) => {
      // Clipboard API may be unavailable in insecure contexts or when the page is unfocused
      console.error('Failed to copy install command to clipboard:', err)
    })
  }

  const isComplete = result?.status === 'complete'
  const isFailed = result?.status === 'failed'

  return (
    <div className="border-t border-gray-800 bg-gray-900/80">
      {/* Main action bar */}
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={handleBuild}
          disabled={disabled || building}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          aria-label={disabledReason || 'Start plugin build'}
        >
          {building ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Hammer className="w-4 h-4" />
          )}
          {building ? 'Building...' : 'Quick Build'}
        </button>

        {/* Push to GitHub button — disabled while a build is in progress or not yet
            complete, to prevent pre-arming showPush which would cause the push section
            to appear automatically when the build finishes */}
        <button
          onClick={() => setShowPush(!showPush)}
          disabled={disabled || !isComplete}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:text-gray-600 text-gray-300 font-medium rounded-lg border border-gray-700 transition-colors"
        >
          <GitBranch className="w-4 h-4" />
          Push to GitHub
        </button>

        {/* Status indicator */}
        {result && (
          <div className="flex items-center gap-2 ml-auto">
            {building && (
              <span className="text-sm text-yellow-400">Building...</span>
            )}
            {isComplete && (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">Build complete</span>
                {result.stats && (
                  <span className="text-xs text-gray-500 ml-2">
                    {result.stats.skills} skills, {result.stats.scripts} scripts, {result.stats.hooks} hooks
                  </span>
                )}
              </>
            )}
            {isFailed && (
              <>
                <X className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">Build failed</span>
              </>
            )}
          </div>
        )}

        {error && !result && (
          <span className="text-sm text-red-400 ml-auto">{error}</span>
        )}

        {disabledReason && disabled && !building && (
          <span className="text-xs text-gray-500 ml-auto">{disabledReason}</span>
        )}
      </div>

      {/* Push to GitHub section — visible whenever the user toggled it open and a manifest is available */}
      {showPush && result?.manifest && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="fork-url" className="block text-xs text-gray-400 mb-1">Your fork URL</label>
              <input
                id="fork-url"
                type="text"
                value={forkUrl}
                onChange={(e) => setForkUrl(e.target.value)}
                placeholder="https://github.com/your-username/ai-maestro-plugins.git"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
            <button
              onClick={handlePush}
              disabled={disabled || pushing || !forkUrl.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
              Push
            </button>
          </div>
          {pushResult && (
            <p className={`text-sm mt-2 ${pushResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {pushResult.message}
            </p>
          )}
        </div>
      )}

      {/* Install command */}
      {isComplete && result?.outputPath && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
            <code className="text-sm text-cyan-400 flex-1 truncate font-mono">
              claude plugin install {result.outputPath}
            </code>
            <button
              onClick={copyInstallCommand}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0"
              aria-label="Copy install command"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Build logs (ANSI codes stripped) */}
      {result && result.logs.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors mb-2"
          >
            {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Build Logs ({result.logs.length} lines)
          </button>
          {showLogs && (
            <div className="bg-gray-950 rounded-lg p-3 max-h-48 overflow-y-auto border border-gray-800">
              <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">
                {stripAnsi(result.logs.join('\n'))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
