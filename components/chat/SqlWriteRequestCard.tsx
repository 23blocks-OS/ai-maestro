'use client'

import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import type { SqlWriteRequestItem } from '@/hooks/useSqlWriteRequests'
import { answerSqlWriteRequestApi, type SqlWriteAnswer } from '@/lib/sql-write-request-api'

interface Props {
  agentId: string
  request: SqlWriteRequestItem
  /** Called after the request was approved or rejected, so the list refreshes. */
  onDone: () => void
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expired'
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * An agent proposed a change to a database through the agentic-sql write door (F037). Nothing has run yet:
 * this is the dry run the wrapper recorded (rows, before and after). Typing the environment name approves
 * exactly this request; the agent then runs the change itself and the wrapper repeats every check.
 */
export default function SqlWriteRequestCard({ agentId, request, onDone }: Props) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const left = request.expiresAt - now
  const expired = left <= 0
  const typedOk = typed.trim() === request.environment
  const canApprove = !busy && !expired && !request.changed && typedOk

  async function answer(body: SqlWriteAnswer) {
    setBusy(true)
    setError(null)
    const result = await answerSqlWriteRequestApi(agentId, request.id, body)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Could not save your answer.')
      return
    }
    setDone(result.approved ? 'Approved. The agent was told to apply it.' : 'Rejected. The agent was told.')
    onDone()
  }

  if (done) {
    return (
      <div className="flex justify-start">
        <div className="rounded-2xl px-4 py-2 bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 text-xs">{done}</div>
      </div>
    )
  }

  return (
    <div className="flex justify-start" data-testid="sql-write-request-card">
      <div className="max-w-[92%] min-w-0 w-full sm:w-[32rem]">
        <form
          className="rounded-2xl px-4 py-3 bg-amber-900/25 border border-amber-600/50 text-amber-50"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault()
            if (canApprove) void answer({ action: 'approve', environment: typed.trim() })
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span className="text-xs font-medium text-amber-300">An agent wants to change data</span>
            <span className={`ml-auto text-[11px] tabular-nums ${expired || left < 60000 ? 'text-red-300' : 'text-amber-200/70'}`}>
              {expired ? 'expired' : `expires in ${formatCountdown(left)}`}
            </span>
          </div>
          <p className="text-xs text-amber-100/80 mb-2">
            <span className="font-mono">{request.kind}</span> on <span className="font-mono">{request.table}</span>, {request.rows} row{request.rows === 1 ? '' : 's'},
            in <span className="font-semibold">{request.environment}</span> (limit {request.maxRows}). Nothing has been changed yet.
            {request.reason ? <span className="block mt-1 text-amber-200/70">Why: {request.reason}</span> : null}
          </p>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words rounded-md bg-gray-950/60 border border-gray-700 px-2 py-1.5 mb-1 text-gray-200">{request.sql}</pre>
          <p className="text-[11px] text-amber-200/70 mb-2 break-words">Values: <span className="font-mono">{request.values}</span></p>
          <div className="text-[11px] mb-2 space-y-1" aria-label="What changes">
            {request.diff.map((d, i) => (
              <div key={i} className="rounded-md bg-gray-950/60 border border-gray-700 px-2 py-1 font-mono break-words text-gray-200">
                <span className="text-amber-300">{d.type}</span>{d.key ? ` (key ${d.key})` : ''}: {d.text}
              </div>
            ))}
            {request.moreRows > 0 && <div className="text-amber-200/70">… and {request.moreRows} more row{request.moreRows === 1 ? '' : 's'}</div>}
            {!request.hasPk && <div className="text-amber-200/70">The table has no primary key, so rows are not matched before and after.</div>}
          </div>
          {request.changed && <p className="text-[11px] text-red-300 mb-2">This request was changed after it was proposed, so it cannot be approved. Ask the agent to propose it again.</p>}
          <label className="block text-[11px] text-amber-300/80 mb-0.5" htmlFor={`sqlw-env-${request.id}`}>
            To approve, type the environment name: <span className="font-mono font-semibold">{request.environment}</span>
          </label>
          <input
            id={`sqlw-env-${request.id}`}
            className="w-full mb-2 rounded-md bg-gray-950/60 border border-gray-700 px-2 py-1.5 text-sm font-mono text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {error && <p className="text-[11px] text-red-300 mb-2">{error}</p>}
          <div className="flex gap-2 mb-2">
            <button type="submit" disabled={!canApprove} className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 text-white disabled:opacity-40">
              {busy ? 'Saving…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer({ action: 'reject' })}
              className="px-3 py-1.5 rounded-md text-xs text-gray-300 border border-gray-600 disabled:opacity-40"
            >
              Reject
            </button>
          </div>
          <p className="text-[10px] text-amber-200/60">
            Approving this exact request lets the agent apply it once; changing a character needs a new request. This stops an agent approving
            by accident or with a plain curl. It does not stop an agent that deliberately forges headers or edits the request file, because
            AI Maestro has no sign-in and the agent and you share one user account. The database login&apos;s own limits are the real backstop.
          </p>
        </form>
      </div>
    </div>
  )
}
