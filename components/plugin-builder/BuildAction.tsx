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
  // Track mounted state so the polling callback never calls setState after unmount
  const mountedRef = useRef(true)

  // clearPoll must be declared before the cleanup useEffect that depends on it
  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollFailures.current = 0
  }, [])

  // Clean up polling on unmount — use memoized clearPoll to avoid stale closure on pollRef
  useEffect(() => {
    mountedRef.current = true
    return () => {
      // Mark unmounted before clearing the interval so the in-flight callback
      // sees the flag and skips any pending setState calls
      mountedRef.current = false
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
    // Reset push-related state on new build
    setShowPush(false)
    setPushResult(null)

    try {
      const res = await fetch('/api/plugin-builder/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!res.ok) {
        // Guard against non-JSON error responses (e.g. gateway errors, HTML pages)
        let errorMsg = 'Build failed'
        try {
          const data = await res.json()
          errorMsg = data.error || errorMsg
        } catch { /* server returned non-JSON — keep default message */ }
        // Guard: component may have unmounted while awaiting the error-response body
        if (!mountedRef.current) return
        setError(errorMsg)
        setBuilding(false)
        return
      }

      const data: PluginBuildResult = await res.json()
      // Guard: component may have unmounted while the initial fetch response body was being parsed
      if (!mountedRef.current) return
      setResult(data)

      // Poll for completion
      if (data.status === 'building') {
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/plugin-builder/builds/${data.buildId}`)
            if (statusRes.ok) {
              pollFailures.current = 0
              const statusData: PluginBuildResult = await statusRes.json()
              // Guard: component may have unmounted while the fetch was in flight
              if (!mountedRef.current) return
              setResult(statusData)

              if (statusData.status !== 'building') {
                clearPoll()
                setBuilding(false)
                setShowLogs(true)
              }
            } else {
              pollFailures.current++
              if (pollFailures.current >= 5) {
                clearPoll()
                if (!mountedRef.current) return
                // Non-2xx response indicates a server-side error, not a lost connection
                let serverMsg = 'Failed to retrieve build status'
                try {
                  const errData = await statusRes.json()
                  if (errData?.error) serverMsg = errData.error
                } catch { /* ignore parse errors — use the default message */ }
                // Re-check after the await: component may have unmounted while parsing the error response
                if (!mountedRef.current) return
                setError(serverMsg)
                setBuilding(false)
                // Do not auto-expand logs on status failure — the error message is sufficient
                // and any partial logs may be incomplete or misleading
              }
            }
          } catch {
            // A thrown exception means a genuine network failure (no response received)
            pollFailures.current++
            if (pollFailures.current >= 5) {
              clearPoll()
              if (!mountedRef.current) return
              setError('Lost connection to build server')
              setBuilding(false)
              // Do not auto-expand logs on connection failure — the error message is sufficient
              // and any partial logs may be incomplete or misleading
            }
          }
        }, 1000)
      } else {
        setBuilding(false)
        setShowLogs(true)
      }
    } catch {
      // Guard: component may have unmounted while the initial fetch was in flight
      if (!mountedRef.current) return
      setError('Failed to connect to server')
      setBuilding(false)
    }
  }

  const handlePush = async () => {
    if (!forkUrl.trim() || !result?.manifest) return

    // Client-side URL validation
    if (!forkUrl.trim().match(/^https:\/\/github\.com\/.+\/.+/)) {
      setPushResult({ ok: false, message: 'URL must be an HTTPS GitHub repository URL' })
      return
    }

    setPushing(true)
    setPushResult(null)

    try {
      const res = await fetch('/api/plugin-builder/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forkUrl: forkUrl.trim(),
          manifest: result.manifest,
        }),
      })

      // Guard against non-JSON responses (e.g. gateway errors, HTML pages)
      let data: { message?: string; error?: string } = {}
      try {
        data = await res.json()
      } catch { /* server returned non-JSON — fall through with empty data so defaults apply */ }
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
    }).catch(() => {
      // Clipboard API not available (insecure context or unfocused)
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

        {/* Push to GitHub button */}
        <button
          onClick={() => setShowPush(!showPush)}
          disabled={!isComplete || disabled}
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

        {/* Show error when present, unless the result already shows a failed status indicator
            (which covers the isFailed case). Polling failures set error while result still
            holds the in-progress build data, so !result would wrongly suppress the message. */}
        {error && !isFailed && (
          <span className="text-sm text-red-400 ml-auto">{error}</span>
        )}

        {/* Show disabledReason whenever the button is disabled and not actively building,
            regardless of whether a prior result exists */}
        {disabledReason && disabled && !building && (
          <span className="text-xs text-gray-500 ml-auto">{disabledReason}</span>
        )}
      </div>

      {/* Push to GitHub section */}
      {showPush && isComplete && (
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
              disabled={pushing || !forkUrl.trim() || disabled}
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
      {isComplete && result.outputPath && (
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
