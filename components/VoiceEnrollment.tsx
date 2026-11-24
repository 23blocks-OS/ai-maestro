'use client'

/**
 * Voice enrollment on the People page (#78). Voiceprints live on the host whose agents hear people, so this asks
 * every host which people it knows by voice and which devices can record. The operator confirms consent here; the
 * person then reads four sentences, on this computer's microphone (the default) or at a device.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, X } from 'lucide-react'
import { isSelfHost } from '@/lib/host-kind'
import { startRecording } from '@/lib/wav-encode'
import type { Host } from '@/types/host'
import type { MeshPerson } from '@/hooks/usePeople'

export interface Kiosk { agentId: string; agentName: string; key: string; name: string; online: boolean; board: boolean }
export interface VoiceHost {
  hostId: string; hostName: string; base: string; ready: boolean; consentText: string; sentences: string[]
  voiceprints: { personId: string; name: string; consentAt: string; enrolledAt: string }[]
  kiosks: Kiosk[]
}

const baseOf = (h: Host) => (isSelfHost(h) ? '' : h.url.replace(/\/$/, ''))

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || `Failed (${res.status})`)
  return body
}

/** Hosts that answer /api/voiceprints: older versions and unreachable hosts are left out */
export function useVoiceHosts(hosts: Host[]) {
  const [voiceHosts, setVoiceHosts] = useState<VoiceHost[]>([])
  const key = hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')
  const load = useCallback(async () => {
    const list = hosts.length ? hosts.filter(h => h.enabled !== false) : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
    const found = await Promise.all(list.map(async (h): Promise<VoiceHost | null> => {
      const base = baseOf(h)
      try {
        const [v, d] = await Promise.all([json(`${base}/api/voiceprints`), json(`${base}/api/devices`).catch(() => ({ agents: [] }))])
        const kiosks: Kiosk[] = (d.agents || []).flatMap((a: { agentId: string; name?: string; devices: { key: string; name?: string; state?: unknown; streams?: string[] }[] }) =>
          // A board has no live microphone: the person starts each recording with its wake phrase
          a.devices.map(dev => ({ agentId: a.agentId, agentName: a.name || a.agentId, key: dev.key, name: dev.name || dev.key.slice(0, 12), online: dev.state !== 'offline', board: !(dev.streams || []).includes('microphone') })))
        return { hostId: h.id, hostName: h.name || h.id, base, ...v, kiosks }
      } catch {
        return null
      }
    }))
    setVoiceHosts(found.filter((x): x is VoiceHost => !!x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { load() }, [load])
  return { voiceHosts, reloadVoice: load }
}

/** Where a person is known by voice: one line per host that keeps a voiceprint, each with its delete */
export function VoiceStatus({ person, voiceHosts, onEnroll, onChanged }: { person: MeshPerson; voiceHosts: VoiceHost[]; onEnroll: () => void; onChanged: () => void }) {
  const held = voiceHosts.filter(h => h.voiceprints.some(v => v.personId === person.id))
  const remove = async (h: VoiceHost) => {
    try { await json(`${h.base}/api/voiceprints/${person.id}`, { method: 'DELETE' }) } catch { /* the reload shows what is left */ }
    onChanged()
  }
  // A renamed person keeps their voiceprint: tell each host that keeps one the name shown here
  const stale = held.filter(h => h.voiceprints.find(v => v.personId === person.id)!.name !== person.displayName).map(h => h.base).join(',')
  useEffect(() => {
    if (!stale || !person.displayName.trim()) return
    Promise.all(stale.split(',').map(base => json(`${base}/api/voiceprints/${person.id}`, { method: 'PATCH', body: JSON.stringify({ name: person.displayName }) })))
      .then(onChanged, () => { /* an older host has no PATCH: it keeps the old name */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, person.id, person.displayName])

  if (!voiceHosts.some(h => h.ready)) {
    return <p className="text-xs text-gray-500">No host can keep voiceprints yet: run <code className="text-gray-400">scripts/install-voice.sh</code> on the host your agents listen from.</p>
  }
  return (
    <div className="space-y-2">
      {held.map(h => {
        const v = h.voiceprints.find(x => x.personId === person.id)!
        return (
          <div key={h.hostId} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-gray-200">Known by voice on {h.hostName}</span>
            <span className="text-gray-500">since {new Date(v.enrolledAt).toLocaleDateString()}</span>
            <button onClick={() => remove(h)} className="ml-auto p-1 rounded text-gray-500 hover:text-red-300 hover:bg-gray-800" title="Delete this voiceprint" aria-label={`Delete the voiceprint on ${h.hostName}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
      {held.length === 0 && <p className="text-xs text-gray-400">Agents cannot tell {person.displayName}&apos;s voice from anyone else&apos;s yet.</p>}
      {person.active && (
        <button onClick={onEnroll} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700">
          <Mic className="w-3.5 h-3.5" /> {held.length ? 'Record again' : 'Enroll voice'}
        </button>
      )}
    </div>
  )
}

const BOARD_WAIT_S = 90 // CLIP_WAIT_MS in lib/device-host.mjs
const MAX_TAKE_S = 15

// On this computer the same takes go to every host that keeps voiceprints: one enrollment, every agent knows the voice
type Source = { kind: 'computer'; hosts: VoiceHost[] } | { kind: 'device'; h: VoiceHost; k: Kiosk }
type Phase =
  | { at: 'consent' }
  | { at: 'sentence'; index: number; status: 'idle' | 'recording' | 'checking' | 'waiting'; error?: string }
  | { at: 'done' }

/**
 * Consent first, then one sentence at a time. On this computer: Record, read, Done. At a device: Record, then the
 * person talks to the device (a board needs its wake phrase first).
 */
export function VoiceEnrollPanel({ person, voiceHosts, onClose }: { person: MeshPerson; voiceHosts: VoiceHost[]; onClose: () => void }) {
  const ready = voiceHosts.filter(h => h.ready)
  const sources: Source[] = [
    ...(ready.length ? [{ kind: 'computer' as const, hosts: ready }] : []),
    ...ready.flatMap(h => h.kiosks.filter(k => k.online).map(k => ({ kind: 'device' as const, h, k }))),
  ]
  const [pick, setPick] = useState(0)
  const source = sources[pick]
  const [agreed, setAgreed] = useState(false)
  const [phase, setPhase] = useState<Phase>({ at: 'consent' })
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)
  const request = useRef<AbortController | null>(null)
  const stopping = useRef(false)
  // Sentences each host has accepted: a retry goes only to the hosts that did not take this one
  const got = useRef<Record<string, number>>({})

  const index = phase.at === 'sentence' ? phase.index : 0
  const status = phase.at === 'sentence' ? phase.status : null
  const targets = !source ? [] : source.kind === 'computer' ? source.hosts : [source.h]
  const sentences = targets[0]?.sentences ?? []
  const where = targets.map(h => h.hostName).join(' and ')
  const consentTexts = [...new Set(targets.map(h => h.consentText))]

  // The meter and the clock while recording; the countdown while a device waits
  useEffect(() => {
    if (status !== 'recording' && status !== 'waiting') return
    const started = Date.now()
    let frame = 0
    const tick = () => {
      const s = Math.floor((Date.now() - started) / 1000)
      setSeconds(s)
      if (status === 'recording') {
        setLevel(recorder.current?.level() ?? 0)
        if (s >= MAX_TAKE_S) { finish(); return }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Leaving the page mid-take must let go of the microphone
  useEffect(() => () => { recorder.current?.cancel() }, [])

  const send = async (i: number, payload: Record<string, unknown>) => {
    request.current = new AbortController()
    const signal = request.current.signal
    const pending = targets.filter(h => (got.current[h.hostId] ?? 0) === i)
    const results = await Promise.allSettled(pending.map(h => json(`${h.base}/api/voiceprints/${person.id}/samples`, {
      method: 'POST',
      body: JSON.stringify({ name: person.displayName, index: i, consent: i === 0 ? agreed : undefined, ...payload }),
      signal,
    })))
    if (signal.aborted) return
    const errors: string[] = []
    results.forEach((r, n) => {
      const h = pending[n]
      if (r.status === 'fulfilled') got.current[h.hostId] = i + 1
      else errors.push(targets.length > 1 ? `${h.hostName}: ${(r.reason as Error).message}` : (r.reason as Error).message)
    })
    if (errors.length) {
      // Out of step, or not one person: only a fresh start helps
      const restart = errors.some(m => /Start again/.test(m))
      if (restart) got.current = {}
      setPhase({ at: 'sentence', index: restart ? 0 : i, status: 'idle', error: errors.join(' ') })
      return
    }
    setPhase(i + 1 >= sentences.length ? { at: 'done' } : { at: 'sentence', index: i + 1, status: 'idle' })
  }

  const record = async () => {
    if (!source) return
    if (source.kind === 'device') {
      setPhase({ at: 'sentence', index, status: 'waiting' })
      return send(index, { agentId: source.k.agentId, deviceKey: source.k.key })
    }
    try {
      recorder.current = await startRecording()
      stopping.current = false
      setPhase({ at: 'sentence', index, status: 'recording' })
    } catch (e) {
      const denied = (e as Error).name === 'NotAllowedError'
      setPhase({ at: 'sentence', index, status: 'idle', error: denied ? 'The browser was not allowed to use the microphone. Allow it in the address bar, then press Record again.' : (e as Error).message })
    }
  }

  const finish = async () => {
    if (!recorder.current || stopping.current) return
    stopping.current = true
    const audio = await recorder.current.stop()
    recorder.current = null
    setPhase({ at: 'sentence', index, status: 'checking' })
    await send(index, { audio })
  }

  const cancel = () => {
    recorder.current?.cancel()
    recorder.current = null
    request.current?.abort()
    if (phase.at === 'sentence') targets.forEach(h => json(`${h.base}/api/voiceprints/${person.id}/samples`, { method: 'DELETE' }).catch(() => {}))
    onClose()
  }

  const label = (s: Source) => s.kind === 'computer' ? "This computer's microphone" : `${s.k.name} (${s.k.agentName}'s device, kept on ${s.h.hostName} only)`

  return (
    <section className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-4" data-testid="voice-enroll" aria-label={`Voice enrollment for ${person.displayName}`}>
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-violet-300" />
        <h3 className="text-sm font-medium text-gray-100">Teach your agents {person.displayName}&apos;s voice</h3>
        <button onClick={cancel} className="ml-auto p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800" aria-label="Cancel enrollment"><X className="w-4 h-4" /></button>
      </div>

      {!source && <p className="text-xs text-gray-400">No host can keep voiceprints yet: run <code>scripts/install-voice.sh</code> on the host your agents listen from.</p>}

      {source && phase.at === 'consent' && (
        <div className="space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="text-gray-400">Record with</span>
            <select value={pick} onChange={e => setPick(Number(e.target.value))} className="block w-full max-w-sm bg-gray-800 text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500">
              {sources.map((s, i) => <option key={i} value={i}>{label(s)}</option>)}
            </select>
          </label>
          {consentTexts.map((text, n) => (
            <blockquote key={n} className="border-l-2 border-gray-700 pl-3 text-gray-300 whitespace-pre-wrap">
              {consentTexts.length > 1 && <span className="block text-[11px] text-gray-500 mb-1">On {targets.filter(h => h.consentText === text).map(h => h.hostName).join(' and ')}:</span>}
              {text}
            </blockquote>
          ))}
          <label className="flex items-start gap-2 text-gray-200">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
            <span>{person.displayName} agreed to {consentTexts.length > 1 ? 'these' : 'this'}</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { got.current = {}; setPhase({ at: 'sentence', index: 0, status: 'idle' }) }} disabled={!agreed} className="px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">Continue</button>
            <button onClick={cancel} className="px-3 py-1.5 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700">Cancel</button>
          </div>
          <p className="text-[11px] text-gray-500">Only the voiceprint is kept, on {where}; the recordings are not. The consent text is set in Settings, Voice.</p>
        </div>
      )}

      {source && phase.at === 'sentence' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5" aria-label={`Sentence ${index + 1} of ${sentences.length}`}>
            {sentences.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < index ? 'bg-violet-400' : i === index ? 'bg-violet-400/50' : 'bg-gray-700'}`} />)}
          </div>
          <p className="text-[11px] text-gray-500">Sentence {index + 1} of {sentences.length}</p>
          <p className="text-lg leading-snug text-gray-50">&ldquo;{sentences[index]}&rdquo;</p>

          {status === 'recording' && (
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <div className="h-1.5 flex-1 max-w-xs rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} /></div>
              <span className="text-xs text-gray-400 tabular-nums">{seconds}s</span>
            </div>
          )}
          {status === 'waiting' && (
            <p className="text-xs text-gray-300">{source.kind === 'device' && source.k.board
              ? `Say the wake phrase to ${source.k.name}, wait for it, then read the sentence. ${Math.max(0, BOARD_WAIT_S - seconds)}s left.`
              : 'Read the sentence at the device now.'}</p>
          )}
          {status === 'checking' && <p className="text-xs text-gray-400">Checking the recording…</p>}
          {phase.at === 'sentence' && phase.error && <p className="text-xs text-red-300" role="alert">{phase.error}</p>}

          <div className="flex gap-2">
            {status === 'recording'
              ? <button onClick={finish} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-gray-900 hover:bg-white text-xs font-medium"><Square className="w-3 h-3" /> Done</button>
              : <button onClick={record} disabled={status !== 'idle'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 text-xs"><Mic className="w-3.5 h-3.5" /> {phase.error ? 'Record again' : 'Record'}</button>}
            <button onClick={cancel} className="px-3 py-1.5 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs">Cancel</button>
          </div>
          {status === 'idle' && source.kind === 'computer' && <p className="text-[11px] text-gray-500">Press Record, read the sentence aloud at a normal pace, then press Done.</p>}
        </div>
      )}

      {phase.at === 'done' && (
        <div className="space-y-3 text-xs">
          <p className="text-emerald-300">Done. Agents on {where} now know {person.displayName}&apos;s voice.</p>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700">Close</button>
        </div>
      )}
    </section>
  )
}
