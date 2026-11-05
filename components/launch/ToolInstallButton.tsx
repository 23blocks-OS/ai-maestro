'use client'

/**
 * "Install" next to a program the host does not have (F072 phase 2). Asks first, inline, then runs the host's
 * fixed installer (POST /api/tools/install) and follows it until it ends. The person sees what runs and where.
 */
import { useEffect, useRef, useState } from 'react'
import type { InstallJob } from '@/services/program-install-service'

const POLL_MS = 2000
// The server stops an install after 10 minutes; this leaves a margin
const MAX_POLLS = 330
const MAX_ERRORS = 5

export default function ToolInstallButton({ tool, command, hostUrl, hostLabel, onInstalled }: {
  tool: string
  /** The command it runs, as the readiness report gives it. */
  command: string
  hostUrl?: string
  hostLabel?: string
  onInstalled: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'failed'>('idle')
  const [job, setJob] = useState<InstallJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current) } }, [])

  const q = hostUrl ? `?hostUrl=${encodeURIComponent(hostUrl)}` : ''

  const fail = (message: string) => { setError(message); setPhase('failed') }

  // Follows the job until it ends. It also stops when the host restarted (no job), another install took over (our
  // job ended, so re-check the tool), the host keeps failing, or the server's own limit has long passed.
  const follow = (polls = 0, errors = 0) => {
    timer.current = setTimeout(async () => {
      let j: InstallJob | null | undefined
      try {
        const r = await fetch(`/api/tools/install${q}`)
        j = r.ok ? ((await r.json())?.job ?? null) : undefined
      } catch { j = undefined }
      if (!alive.current) return
      if (j === undefined) {
        if (errors + 1 >= MAX_ERRORS) return fail('The host stopped answering. Check the program again later.')
      } else if (j === null) {
        onInstalled()
        return fail('The host lost track of the install (it may have restarted). Check the program again.')
      } else if (j.tool !== tool) {
        setPhase('idle'); onInstalled(); return
      } else if (j.state !== 'running') {
        setJob(j)
        if (j.state === 'done') { setPhase('idle'); onInstalled() } else setPhase('failed')
        return
      }
      if (polls + 1 >= MAX_POLLS) return fail('It is taking longer than expected. Check the program again later.')
      follow(polls + 1, j === undefined ? errors + 1 : 0)
    }, POLL_MS)
  }

  const start = async () => {
    setPhase('running'); setError(null); setJob(null)
    try {
      const r = await fetch('/api/tools/install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, hostUrl }),
      })
      const data = await r.json().catch(() => ({}))
      if (!alive.current) return
      if (r.status === 202 || (r.status === 409 && data?.job?.tool === tool)) return follow()
      fail(data?.message || data?.error || `HTTP ${r.status}`)
    } catch {
      if (alive.current) fail('The host did not answer.')
    }
  }

  const where = hostLabel || 'this host'
  if (phase === 'confirm') {
    return (
      <div className="mt-1 rounded border border-zinc-700 bg-zinc-900/60 p-2 text-[11px] text-zinc-300" data-testid="tool-install-confirm">
        <p>Runs <code className="text-zinc-100">{command}</code> on {where}. npm downloads it from the npm registry into its global folder. It can take a few minutes.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={start} className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-500" data-testid="tool-install-go">Install</button>
          <button type="button" onClick={() => setPhase('idle')} className="rounded px-2 py-0.5 text-zinc-400 hover:text-zinc-200">Cancel</button>
        </div>
      </div>
    )
  }
  if (phase === 'running') {
    return <p className="mt-1 text-[11px] text-zinc-400" data-testid="tool-install-running">Installing on {where}…</p>
  }
  return (
    <div className="mt-1 text-[11px]">
      {phase === 'failed' && (
        <div className="text-red-300" data-testid="tool-install-failed">
          <p className="break-words">{error || job?.message || 'The install failed.'}</p>
          {job?.output && (
            <details className="mt-1 text-zinc-500">
              <summary className="cursor-pointer">npm output</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words">{job.output}</pre>
            </details>
          )}
        </div>
      )}
      <button type="button" onClick={() => setPhase('confirm')} className="mt-1 rounded border border-amber-500/40 px-2 py-0.5 text-amber-300 hover:bg-amber-500/10" data-testid="tool-install">
        {phase === 'failed' ? 'Try again' : 'Install'}
      </button>
    </div>
  )
}
