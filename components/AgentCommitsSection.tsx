'use client'

import { useEffect, useState } from 'react'
import type { AgentCommitsResult, TraceCommit, TraceMatch, TracePr, TraceResult } from '@/services/commit-trace-service'

const short = (sha?: string) => (sha ? sha.slice(0, 8) : 'no sha')
const when = (ts: string) => (ts ? ts.slice(0, 16).replace('T', ' ') : '')
const prUrl = (p: TracePr) => (p.repo ? `https://github.com/${p.repo}/pull/${p.pr}` : undefined)

const CONFIDENCE: Record<TraceMatch['confidence'], string> = {
  exact: 'The session recorded this commit',
  likely: 'Matched through the pull request',
  weak: 'Same first line of message only',
}

function Evidence({ commit }: { commit: TraceCommit }) {
  return (
    <details className="mt-1 text-[11px] text-gray-500">
      <summary className="cursor-pointer hover:text-gray-300">What the session ran</summary>
      <pre className="mt-1 whitespace-pre-wrap break-all bg-black/30 rounded p-2 text-gray-400">{commit.command}</pre>
      {commit.evidence ? <pre className="mt-1 whitespace-pre-wrap break-all bg-black/30 rounded p-2 text-gray-400">{commit.evidence}</pre> : null}
    </details>
  )
}

function PrLinks({ prs }: { prs: TracePr[] }) {
  const seen = new Set<string>()
  const unique = prs.filter(p => { const k = `${p.repo}#${p.pr}`; if (seen.has(k)) return false; seen.add(k); return true })
  if (unique.length === 0) return null
  return (
    <span className="ml-2">
      {unique.map(p => {
        const url = prUrl(p)
        return url
          ? <a key={`${p.repo}#${p.pr}`} href={url} target="_blank" rel="noreferrer" className="mr-2 text-blue-400 hover:text-blue-300">PR #{p.pr}</a>
          : <span key={p.pr} className="mr-2 text-gray-400">PR #{p.pr}</span>
      })}
    </span>
  )
}

/** The commits of one agent, newest first */
export function CommitRows({ commits }: { commits: TraceCommit[] }) {
  if (commits.length === 0) return <p className="text-xs text-gray-500" data-testid="commits-empty">No commits found in this agent&apos;s Claude Code sessions yet.</p>
  return (
    <ul className="space-y-2" data-testid="commit-rows">
      {commits.map((c, i) => (
        <li key={`${c.sha || 'x'}-${c.line}-${i}`} className="text-xs">
          <span className="font-mono text-amber-300/90">{short(c.sha)}</span>
          <span className="ml-2 text-gray-200">{c.subject || '(message not recorded)'}</span>
          <span className="ml-2 text-gray-500">{when(c.ts)}</span>
          <Evidence commit={c} />
        </li>
      ))}
    </ul>
  )
}

/** The answer to "which session made this commit?" */
export function TraceMatches({ result }: { result: TraceResult }) {
  return (
    <div className="space-y-3" data-testid="trace-result">
      {result.subject ? <p className="text-xs text-gray-400">{result.subject}</p> : null}
      {result.matches.length === 0 ? <p className="text-xs text-gray-500">No session is known to have made this commit.</p> : null}
      {result.matches.map(m => (
        <div key={`${m.hostId}|${m.agentId}|${m.sessionId}|${m.via}`} className="rounded border border-gray-700/50 bg-gray-800/40 p-2.5 text-xs" data-testid="trace-match">
          <div>
            <a href={`/?agent=${encodeURIComponent(m.agentId)}`} className="text-blue-400 hover:text-blue-300">{m.agentName}</a>
            <span className="ml-2 text-gray-500">{m.hostId} · session {m.sessionId.slice(0, 8)}</span>
            <PrLinks prs={m.prs} />
          </div>
          <p className="mt-0.5 text-gray-400">{CONFIDENCE[m.confidence]}{m.role !== 'committed' ? ` (${m.role} the pull request)` : ''}</p>
          {m.commits.slice(0, 5).map((c, i) => (
            <div key={`${c.sha || 'x'}-${i}`} className="mt-1">
              <span className="font-mono text-amber-300/90">{short(c.sha)}</span>
              <span className="ml-2 text-gray-200">{c.subject || ''}</span>
              <Evidence commit={c} />
            </div>
          ))}
        </div>
      ))}
      {result.unreachable.length > 0 ? <p className="text-xs text-amber-300" data-testid="trace-unreachable">Could not ask: {result.unreachable.join(', ')}. The answer may be missing sessions on those hosts.</p> : null}
      {result.partial ? <p className="text-xs text-amber-300">Not every session could be read in the time allowed; try again in a moment.</p> : null}
    </div>
  )
}

/**
 * The body of the Agent Profile's "Commits" section: this agent's commits, and a box to find the
 * session behind any commit (asked of every host). Loaded only when the section is opened.
 */
export default function AgentCommitsSection({ agentId, hostUrl }: { agentId: string; hostUrl?: string }) {
  const [list, setList] = useState<AgentCommitsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setError(null)
    fetch(`${(hostUrl || '').replace(/\/$/, '')}/api/agents/${encodeURIComponent(agentId)}/commits?limit=30`)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) setError((data as { message?: string }).message || `The host answered ${r.status}`)
        else setList(data as AgentCommitsResult)
      })
      .catch(() => { if (alive) setError('Could not reach the host this agent lives on') })
    return () => { alive = false }
  }, [agentId, hostUrl])

  const find = async () => {
    const sha = query.trim()
    setTrace(null)
    setTraceError(null)
    if (!/^[0-9a-fA-F]{7,40}$/.test(sha)) { setTraceError('A commit id is 7 to 40 letters and digits (0-9, a-f).'); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/commits/${encodeURIComponent(sha)}`)
      const data = await r.json().catch(() => ({}))
      if (r.ok) setTrace(data as TraceResult)
      else setTraceError((data as { message?: string }).message || `The server answered ${r.status}`)
    } catch {
      setTraceError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="agent-commits">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">Find the session behind a commit</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void find() }}
            placeholder="commit id (7 or more characters)"
            className="flex-1 text-xs font-mono bg-gray-800/50 text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-600"
            data-testid="trace-input"
          />
          <button onClick={() => void find()} disabled={busy} className="text-xs px-3 py-1.5 rounded bg-blue-600/80 hover:bg-blue-500 text-white disabled:opacity-50">
            {busy ? 'Looking…' : 'Find'}
          </button>
        </div>
        {traceError ? <p className="mt-1.5 text-xs text-red-400" data-testid="trace-error">{traceError}</p> : null}
        {trace ? <div className="mt-3"><TraceMatches result={trace} /></div> : null}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">This agent&apos;s recent commits</p>
        {error ? <p className="text-xs text-amber-300">{error}</p> : list ? (
          <>
            <CommitRows commits={list.commits} />
            {list.partial ? <p className="mt-2 text-xs text-amber-300">Older sessions are still being read; open this again in a moment.</p> : null}
          </>
        ) : <p className="text-xs text-gray-500">Reading the sessions…</p>}
      </div>
    </div>
  )
}
