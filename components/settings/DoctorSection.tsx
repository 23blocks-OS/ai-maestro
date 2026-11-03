'use client'

/**
 * Doctor (F069, docs/SPEC-DOCTOR.md section 7): one card per host, each fetched from that host directly.
 * Fixes post to the host the report came from, which is the host the agent lives on.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Stethoscope, RefreshCw, Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { isSelfHost } from '@/lib/host-kind'
import { fleetChecks, groupChecks, peerChecksToShow } from '@/lib/doctor-fleet'
import type { Host } from '@/types/host'
import type { DiagnosticCheck, DiagnosticItem, DiagnosticReport, DiagnosticStatus } from '@/services/diagnostics-service'

const TIMEOUT_MS = 25000 // worst case for one host is about 20 s (a slow peer or du)
const CATEGORY_LABEL = { agents: 'Agents', install: 'Install', host: 'Host', peers: 'Peers' }

interface HostState { loading: boolean; report?: DiagnosticReport | null; error?: string | null; note?: { ok: boolean; text: string } | null }

const baseOf = (h: Host) => (isSelfHost(h) ? '' : h.url)

function StatusIcon({ status, className = 'w-4 h-4' }: { status: DiagnosticStatus; className?: string }) {
  if (status === 'fail') return <XCircle className={`${className} text-red-400 flex-shrink-0`} />
  if (status === 'warn') return <AlertTriangle className={`${className} text-yellow-400 flex-shrink-0`} />
  return <CheckCircle className={`${className} text-green-400 flex-shrink-0`} />
}

export default function DoctorSection() {
  const { hosts } = useHosts()
  const enabled = useMemo(() => {
    const list = hosts.filter(h => h.enabled !== false)
    return [...list.filter(isSelfHost), ...list.filter(h => !isSelfHost(h))]
  }, [hosts])
  const hostKey = enabled.map(h => `${h.id}|${h.url}`).join(',')
  const [state, setState] = useState<Record<string, HostState>>({})
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async (host: Host, fresh: boolean) => {
    setState(s => ({ ...s, [host.id]: { ...s[host.id], loading: true } }))
    try {
      const res = await fetch(`${baseOf(host)}/api/diagnostics${fresh ? '?fresh=1' : ''}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const report = await res.json() as DiagnosticReport
      setState(s => ({ ...s, [host.id]: { ...s[host.id], loading: false, report, error: null } }))
    } catch (err) {
      const msg = err instanceof Error && err.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000} s` : (err as Error).message
      setState(s => ({ ...s, [host.id]: { ...s[host.id], loading: false, report: null, error: msg } }))
    }
  }, [])

  // Fetch once per host list, not on every hosts poll.
  useEffect(() => {
    enabled.forEach(h => load(h, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostKey, load])

  const runFix = async (host: Host, check: DiagnosticCheck, item: DiagnosticItem) => {
    setConfirming(null)
    let note: HostState['note']
    try {
      const res = await fetch(`${baseOf(host)}/api/diagnostics/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check: check.name, key: item.key, fix: item.fix!.id }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const body = await res.json().catch(() => ({}))
      note = { ok: res.ok, text: body.message || `HTTP ${res.status}` }
    } catch (err) {
      note = { ok: false, text: (err as Error).message }
    }
    setState(s => ({ ...s, [host.id]: { ...s[host.id], note } }))
    load(host, true)
  }

  const fleet = fleetChecks(enabled.map(h => ({ hostId: h.id, report: state[h.id]?.report, error: state[h.id]?.error })))
  const peers = peerChecksToShow(enabled.map(h => ({ hostId: h.id, name: h.name, checks: state[h.id]?.report?.checks || [] })))

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Stethoscope className="w-6 h-6" /> Doctor</h1>
          <p className="text-sm text-gray-400 mt-1">Checks agents, installs and hosts. Each host checks itself; a fix asks first and checks again before it acts.</p>
        </div>
        <button
          onClick={() => enabled.forEach(h => load(h, true))}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200"
        >
          <RefreshCw className="w-4 h-4" /> Refresh all
        </button>
      </div>

      {enabled.length === 0 && <p className="text-gray-400 text-sm">Loading hosts…</p>}

      <div className="space-y-6">
        {enabled.map(host => {
          const st = state[host.id] || { loading: true }
          const r = st.report
          const extra = fleet[host.id] || []
          const groups = groupChecks([...extra, ...(r?.checks || [])], peers[host.id])
          // counts from what the card shows, so the header never names a failure the card hides
          const shown = groups.flatMap(g => g.checks)
          const count = (s: DiagnosticStatus) => shown.filter(c => c.status === s).length
          const status: DiagnosticStatus = count('fail') ? 'fail' : count('warn') ? 'warn' : 'pass'
          return (
            <section key={host.id} className="border border-gray-800 rounded-xl bg-gray-900/40">
              <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div className="flex items-center gap-3 min-w-0">
                  {shown.length > 0 && <StatusIcon status={status} className="w-5 h-5" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{host.name}</div>
                    <div className="text-xs text-gray-500">
                      {r ? <>v{r.version || '?'} · {count('pass')} passed, {count('warn')} warnings, {count('fail')} failed · {new Date(r.timestamp).toLocaleTimeString()}</> : host.url}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => load(host, true)}
                  disabled={st.loading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  {st.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
                </button>
              </header>

              {st.note && (
                <div className={`mx-4 mt-3 px-3 py-2 rounded-md text-sm ${st.note.ok ? 'bg-green-900/30 text-green-300' : 'bg-yellow-900/30 text-yellow-200'}`}>{st.note.text}</div>
              )}

              <div className="p-4 space-y-4">
                {!r && !st.error && extra.length === 0 && <p className="text-sm text-gray-500">Checking…</p>}
                {groups.map(g => (
                  <div key={g.category}>
                    <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">{CATEGORY_LABEL[g.category]}</h3>
                    <ul className="space-y-1.5">
                      {g.checks.map(check => (
                        <li key={check.name} className="text-sm">
                          <div className="flex items-start gap-2">
                            <StatusIcon status={check.status} />
                            <div className="min-w-0">
                              <span className="text-gray-200 font-medium">{check.name}</span>
                              <span className="text-gray-400"> — {check.message}</span>
                              {check.hint && check.status !== 'pass' && <div className="text-xs text-gray-500 mt-0.5">{check.hint}</div>}
                            </div>
                          </div>
                          {check.items && check.items.length > 0 && (
                            <ul className="ml-6 mt-1.5 space-y-1.5 border-l border-gray-800 pl-3">
                              {check.items.map(item => {
                                const cid = `${host.id}|${check.name}|${item.key}`
                                // a backup item names a deleted agent: nothing to open
                                const linkAgent = item.agentId && check.name !== 'deleted-agent-backups'
                                return (
                                  <li key={item.key} className="text-xs">
                                    <div className="flex items-start gap-2">
                                      <StatusIcon status={item.status} className="w-3.5 h-3.5 mt-px" />
                                      <div className="min-w-0 flex-1">
                                        {linkAgent && <a href={`/?agent=${encodeURIComponent(item.agentId!)}`} className="text-blue-400 hover:underline mr-1">{item.agentName || item.agentId}</a>}
                                        <span className="text-gray-300 break-words">{item.message}</span>
                                      </div>
                                      {item.fix && confirming !== cid && (
                                        <button
                                          onClick={() => setConfirming(cid)}
                                          className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ${item.fix.destructive ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                                        >
                                          {item.fix.label}
                                        </button>
                                      )}
                                    </div>
                                    {item.fix && confirming === cid && (
                                      <div className="mt-1.5 ml-5 p-2 rounded-md bg-gray-800/80 border border-gray-700">
                                        <p className="text-gray-200 mb-2">{item.fix.confirm}</p>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => runFix(host, check, item)}
                                            className={`px-2.5 py-1 rounded text-xs text-white ${item.fix.destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                                          >
                                            {item.fix.label}
                                          </button>
                                          <button onClick={() => setConfirming(null)} className="px-2.5 py-1 rounded text-xs text-gray-300 hover:bg-gray-700">Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
