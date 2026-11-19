'use client'

/**
 * Settings > Approvals (F118 step 2): the approval requests of every host, from `ask` rules. A person approves once, for
 * an hour, always (an exception in the rule) or refuses. The answer goes to the host that keeps the request.
 * No login: a click here is recorded as an unverified person, under the name typed below if any.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'

interface ApprovalView {
  id: string
  created: string
  host: string
  action: string
  from: string
  to: string
  rules: string[]
  reason: string
  approvers: { ref: string; label: string; via: string }[]
  unresolved?: string[]
  proof: 'any' | 'signed'
  expiresAt: string
  state: 'pending' | 'approved' | 'refused' | 'expired'
  held?: { path: string }
  answer?: { answer: string; for?: string; by: string; how: string; at: string }
  delivery?: { ok: boolean; message?: string }
}

const NAME_KEY = 'aimaestro.approvals.name'

function minutesLeft(iso: string): string {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  return m <= 0 ? 'expiring' : m < 60 ? `${m} min left` : `${Math.round(m / 60)} h left`
}

export default function ApprovalsSection() {
  const [requests, setRequests] = useState<ApprovalView[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [unreachable, setUnreachable] = useState<string[]>([])
  const [name, setName] = useState('')

  useEffect(() => {
    try { setName(localStorage.getItem(NAME_KEY) || '') } catch { /* storage blocked */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/policy/requests${showAll ? '' : '?state=pending'}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`)
      setRequests(data.requests || [])
      setUnreachable((data.unreachable || []).map((u: { host: string }) => u.host))
    } catch (e) {
      setError(`Could not load approval requests: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [showAll])

  useEffect(() => {
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [load])

  const answer = async (r: ApprovalView, kind: 'once' | 'for' | 'always' | 'refuse') => {
    if (kind === 'always' && !confirm(`Always allow ${r.from} to ${r.action} ${r.to}? This adds an exception to rule ${r.rules.join(', ')} on ${r.host}.`)) return
    setBusy(r.id)
    setError(null)
    try {
      const res = await fetch(`/api/policy/requests/${encodeURIComponent(r.id)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: kind, ...(kind === 'for' ? { for: '1h' } : {}), ...(name.trim() ? { by: name.trim() } : {}), host: r.host }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.message || data.error || `HTTP ${res.status}`)
      else if (data.delivery && !data.delivery.ok) setError(`Approved, but the message could not be delivered: ${data.delivery.message || 'unknown error'}`)
      await load()
    } catch (e) {
      setError(`Could not send the answer: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const saveName = (v: string) => {
    setName(v)
    try { localStorage.setItem(NAME_KEY, v) } catch { /* storage blocked */ }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Approvals</h1>
          <p className="text-gray-400">
            Messages and calls that a rule says need a person&apos;s approval. A held message is delivered once it is approved.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
        <label className="flex items-center gap-2 text-gray-300">
          Answer as
          <input
            value={name}
            onChange={e => saveName(e.target.value)}
            placeholder="your name (optional)"
            aria-label="Your name, recorded with your answer"
            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-gray-100 w-48"
          />
        </label>
        <label className="flex items-center gap-2 text-gray-300">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Show answered and expired
        </label>
        <span className="text-xs text-gray-500">No login: an answer here is recorded as an unverified person.</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {unreachable.length > 0 && (
        <p className="mb-4 text-xs text-yellow-400">Not reachable, so their requests are not shown: {unreachable.join(', ')}</p>
      )}

      {requests.length === 0 ? (
        <div className="text-center p-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-200 mb-2">{loading ? 'Loading…' : 'Nothing waits for approval'}</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            A rule with &quot;effect&quot;: &quot;ask&quot; in ~/.aimaestro/policy.json puts requests here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(r => (
            <div key={`${r.host}:${r.id}`} className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-medium text-gray-100">{r.from}</span>
                <span className="text-gray-400">wants to {r.action}</span>
                <span className="font-medium text-gray-100">{r.to}</span>
                {r.held && <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300">message held</span>}
                {r.proof === 'signed' && <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-300">needs a signed answer on a phone</span>}
                <span className="ml-auto text-xs text-gray-500">{r.host} · {r.state === 'pending' ? minutesLeft(r.expiresAt) : r.state}</span>
              </div>
              <p className="text-sm text-gray-400 mb-1">Rule {r.rules.join(', ')}. Approvers: {r.approvers.map(a => a.label).join(', ')}</p>
              <p className="text-xs text-gray-500 mb-3 break-words">{r.reason}</p>
              {r.answer && (
                <p className="text-sm text-gray-300 mb-2">
                  {r.state === 'refused' ? 'Refused' : `Approved (${r.answer.answer}${r.answer.for ? ` ${r.answer.for}` : ''})`} by {r.answer.by}
                  {r.delivery ? (r.delivery.ok ? ', delivered' : `, not delivered: ${r.delivery.message || 'error'}`) : ''}
                </p>
              )}
              {r.state === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  {([['once', 'Approve once'], ['for', 'For 1 hour'], ['always', 'Always']] as const).map(([kind, label]) => (
                    <button
                      key={kind}
                      onClick={() => answer(r, kind)}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => answer(r, 'refuse')}
                    disabled={busy === r.id}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-all disabled:opacity-50"
                  >
                    Refuse
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
