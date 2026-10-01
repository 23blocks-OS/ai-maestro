'use client'

import { useState, useEffect, useCallback } from 'react'
import { Moon, Pause, Play, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Settings → Memory: when and how much consolidation runs on this host.
 * Consolidation is the part of memory that spends money (Jev on the host's key,
 * the summarizer on the Claude subscription). See lib/memory/settings.ts.
 */

interface Consolidation {
  paused: boolean
  startHour: number
  endHour: number
  backlog: boolean
  agentsPerSweep: number
  maxPassagesPerRun: number
  maxSummaryCallsPerRun: number
}

interface Status {
  state: 'paused' | 'in_window' | 'scheduled'
  pausedByEnvironment: boolean
  inWindow: boolean
  nextWindowAt: string | null
  backlogRunning: boolean
  agents: { memoryOn: number; building: number; historyWaiting: number }
  lastRunAt: number | null
  last24h: { agents: number; conversations: number; memories: number }
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const windowHours = (c: Pick<Consolidation, 'startHour' | 'endHour'>) => ((c.endHour - c.startHour + 24) % 24) || 24

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `today at ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `tonight at ${time}`
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Everything the Save button covers (pause saves on its own) */
const scheduleOf = (c: Consolidation): Omit<Consolidation, 'paused'> => ({
  startHour: c.startHour,
  endHour: c.endHour,
  backlog: c.backlog,
  agentsPerSweep: c.agentsPerSweep,
  maxPassagesPerRun: c.maxPassagesPerRun,
  maxSummaryCallsPerRun: c.maxSummaryCallsPerRun,
})

const STATE_PILL: Record<Status['state'], { label: string; cls: string }> = {
  paused: { label: 'Paused', cls: 'bg-orange-500/10 text-orange-400' },
  in_window: { label: 'Window open', cls: 'bg-green-500/10 text-green-400' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-500/10 text-blue-400' },
}

export default function MemoryConsolidationCard() {
  const [stored, setStored] = useState<Consolidation | null>(null)
  const [form, setForm] = useState<Consolidation | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<'pause' | 'save' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [advanced, setAdvanced] = useState(false)

  const apply = (data: { consolidation: Consolidation; status: Status }) => {
    setStored(data.consolidation)
    setForm(data.consolidation)
    setStatus(data.status)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/memory')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      apply(await res.json())
    } catch (err) {
      setMessage({ ok: false, text: `Could not load: ${(err as Error).message}` })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const put = async (consolidation: Partial<Consolidation>, kind: 'pause' | 'save', ok: string) => {
    setBusy(kind)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consolidation }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
      apply(data)
      setMessage({ ok: true, text: ok })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  if (!form || !stored || !status) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 text-sm text-gray-400 flex items-center gap-2">
        {message ? <><AlertCircle className="w-4 h-4 text-red-400" />{message.text}</> : <><Loader2 className="w-4 h-4 animate-spin" />Loading…</>}
      </div>
    )
  }

  const paused = stored.paused
  const scheduleForm = scheduleOf(form)
  const dirty = JSON.stringify(scheduleForm) !== JSON.stringify(scheduleOf(stored))
  const pill = STATE_PILL[status.state]
  const set = (patch: Partial<Consolidation>) => setForm({ ...form, ...patch })
  const inputClass = 'px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500'
  const hours = Array.from({ length: 24 }, (_, h) => h)

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-5">
      {/* State and the one button you need most */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">Consolidation</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${pill.cls}`}>{pill.label}</span>
            {status.backlogRunning && <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">Catching up history</span>}
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Turns conversations into memories. This is the part of memory that costs money: it calls the classifier (your key)
            and the summarizer (your Claude subscription). Indexing, search and recall are local and keep working while paused.
          </p>
        </div>
        <button
          onClick={() => put({ paused: !stored.paused }, 'pause', stored.paused ? 'Resumed' : 'Paused')}
          disabled={busy !== null || status.pausedByEnvironment}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 ${
            stored.paused ? 'bg-green-600 hover:bg-green-500 text-white' : 'border border-gray-600 text-gray-200 hover:border-orange-500/60 hover:text-orange-300'
          }`}
        >
          {busy === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : stored.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {stored.paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {status.pausedByEnvironment && (
        <p className="text-xs text-orange-300">Paused by the environment variable MEMORY_CONSOLIDATION_PAUSED on this host. Remove it to resume.</p>
      )}
      {paused && !status.pausedByEnvironment && (
        <p className="text-xs text-gray-400">
          No new runs start, on any path: the nightly schedule, the history catch-up, or an agent&apos;s Consolidate button.
          A run already in progress finishes.
        </p>
      )}

      {/* What it has been doing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-gray-900/60 p-3">
          <div className="text-xs text-gray-500">Agents building memory</div>
          <div className="text-lg text-white font-semibold">{status.agents.building}<span className="text-xs text-gray-500 font-normal"> of {status.agents.memoryOn} with memory</span></div>
        </div>
        <div className="rounded-lg bg-gray-900/60 p-3">
          <div className="text-xs text-gray-500">History still waiting</div>
          <div className="text-lg text-white font-semibold">{status.agents.historyWaiting}<span className="text-xs text-gray-500 font-normal"> agents</span></div>
        </div>
        <div className="rounded-lg bg-gray-900/60 p-3">
          <div className="text-xs text-gray-500">Last run</div>
          <div className="text-lg text-white font-semibold">{status.lastRunAt ? ago(status.lastRunAt) : 'never'}</div>
        </div>
        <div className="rounded-lg bg-gray-900/60 p-3">
          <div className="text-xs text-gray-500">Last 24 hours</div>
          <div className="text-sm text-white font-semibold">
            {status.last24h.memories} memories
            <span className="block text-xs text-gray-500 font-normal">from {status.last24h.conversations} conversations, {status.last24h.agents} agents</span>
          </div>
        </div>
      </div>

      {/* When */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-200">
          <Moon className="w-4 h-4 text-purple-400" />
          <span>Runs every night from</span>
          <select className={inputClass} value={form.startHour} onChange={e => set({ startHour: Number(e.target.value) })}>
            {hours.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          <span>to</span>
          <select className={inputClass} value={form.endHour} onChange={e => set({ endHour: Number(e.target.value) })}>
            {hours.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-500 pl-6">
          {windowHours(form)} hours.{' '}
          {!stored.paused && status.nextWindowAt && !dirty && (status.inWindow ? 'Open now.' : `Next ${when(status.nextWindowAt)}.`)}{' '}
          Each agent with memory consolidates once at the start; heavy work stays out of the working day.
        </p>
        <label className="flex items-start gap-3 pl-6 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={form.backlog} onChange={e => set({ backlog: e.target.checked })} />
          <span className="text-sm text-gray-200">
            Catch up older history during the window
            <span className="block text-xs text-gray-500">
              Agents with months of conversations keep consolidating, newest first, one agent at a time, until the window
              closes. Off: one run per agent per night.
            </span>
          </span>
        </label>
      </div>

      {/* How much */}
      <div>
        <button onClick={() => setAdvanced(!advanced)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          {advanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Limits per run
        </button>
        {advanced && (
          <div className="grid md:grid-cols-3 gap-4 mt-3 pl-5">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Classifier calls (passages)</label>
              <input type="number" min={50} max={10000} step={50} className={`${inputClass} w-full`} value={form.maxPassagesPerRun}
                onChange={e => set({ maxPassagesPerRun: Number(e.target.value) })} />
              <p className="text-xs text-gray-500 mt-1">Jev calls per agent per run (50–10,000). The next run continues.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Summarizer calls</label>
              <input type="number" min={0} max={50} className={`${inputClass} w-full`} value={form.maxSummaryCallsPerRun}
                onChange={e => set({ maxSummaryCallsPerRun: Number(e.target.value) })} />
              <p className="text-xs text-gray-500 mt-1">Claude calls per agent per run (0–50). 0 keeps verbatim memories only.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Agents per pass</label>
              <input type="number" min={1} max={200} className={`${inputClass} w-full`} value={form.agentsPerSweep}
                onChange={e => set({ agentsPerSweep: Number(e.target.value) })} />
              <p className="text-xs text-gray-500 mt-1">Agents the night sweep visits every 15 minutes (1–200).</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {dirty && (
          <>
            <button onClick={() => put(scheduleForm, 'save', 'Saved')} disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : 'Save schedule'}
            </button>
            <button onClick={() => setForm(stored)} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200">Discard</button>
          </>
        )}
        {message && (
          <span className={`flex items-center gap-1.5 text-sm ${message.ok ? 'text-green-400' : 'text-red-400'}`}>
            {message.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        These apply to every agent on this host. Per agent, memory, recall and building new memories are switched in the
        agent&apos;s Skills tab.
      </p>
    </div>
  )
}
