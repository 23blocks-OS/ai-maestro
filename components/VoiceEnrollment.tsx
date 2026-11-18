'use client'

/**
 * Voice enrollment on the People page (#78). Voiceprints live on the host whose kiosk hears people, so this asks
 * every host which people it knows by voice and which devices can record. The operator confirms consent here; the
 * person then reads four sentences at the kiosk.
 */

import { useCallback, useEffect, useState } from 'react'
import { isSelfHost } from '@/lib/host-kind'
import type { Host } from '@/types/host'
import type { MeshPerson } from '@/hooks/usePeople'

export interface Kiosk { agentId: string; agentName: string; key: string; name: string; online: boolean }
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
        const kiosks: Kiosk[] = (d.agents || []).flatMap((a: { agentId: string; name?: string; devices: { key: string; name?: string; state?: unknown }[] }) =>
          a.devices.map(dev => ({ agentId: a.agentId, agentName: a.name || a.agentId, key: dev.key, name: dev.name || dev.key.slice(0, 12), online: dev.state !== 'offline' })))
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

/** Where a person is known by voice, with a delete button for each */
export function VoiceCell({ person, voiceHosts, onEnroll, onChanged }: { person: MeshPerson; voiceHosts: VoiceHost[]; onEnroll: () => void; onChanged: () => void }) {
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
  return (
    <>
      {held.map(h => {
        const v = h.voiceprints.find(x => x.personId === person.id)!
        return (
          <div key={h.hostId} className="text-[10px] text-gray-400" title={`Consent recorded ${new Date(v.consentAt).toLocaleString()}`}>
            voiceprint on {h.hostName}
            <button onClick={() => remove(h)} className="ml-1 text-gray-500 hover:text-red-300" title="Delete this voiceprint">delete</button>
          </div>
        )
      })}
      {person.active && held.length === 0 && voiceHosts.some(h => h.ready) && (
        <button onClick={onEnroll} className="text-[10px] text-gray-500 hover:text-gray-200">enroll voice</button>
      )}
      {held.length === 0 && !voiceHosts.some(h => h.ready) && <span className="text-gray-600">-</span>}
    </>
  )
}

type Step = { at: number; busy: boolean; error: string | null; done: boolean }

/** Consent first, then one sentence at a time: each press records 5 s at the kiosk */
export function VoiceEnrollPanel({ person, voiceHosts, onClose }: { person: MeshPerson; voiceHosts: VoiceHost[]; onClose: () => void }) {
  const choices = voiceHosts.filter(h => h.ready).flatMap(h => h.kiosks.map(k => ({ h, k })))
  const [choice, setChoice] = useState(() => Math.max(0, choices.findIndex(c => c.k.online)))
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState<Step | null>(null)
  const picked = choices[choice]

  const record = async (index: number) => {
    if (!picked) return
    setStep({ at: index, busy: true, error: null, done: false })
    try {
      const r = await json(`${picked.h.base}/api/voiceprints/${person.id}/samples`, {
        method: 'POST',
        body: JSON.stringify({ name: person.displayName, agentId: picked.k.agentId, deviceKey: picked.k.key, index, consent: index === 0 ? agreed : undefined }),
      })
      setStep(r.enrolled ? { at: index, busy: false, error: null, done: true } : { at: r.count, busy: false, error: null, done: false })
    } catch (e) {
      const message = (e as Error).message
      // Out of step or not one person: only a fresh start helps
      const restart = /Start again/.test(message)
      setStep({ at: restart ? 0 : index, busy: false, error: message, done: false })
    }
  }

  const box = 'px-4 py-3 border-b border-gray-800 bg-gray-900/60 text-xs space-y-2'
  if (!choices.length) {
    return (
      <div className={box}>
        <div className="text-gray-300">No host with voiceprints has a device to record on. Pair a kiosk with an agent on that host first.</div>
        <button onClick={onClose} className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Close</button>
      </div>
    )
  }
  const sentences = picked?.h.sentences ?? []
  return (
    <div className={box} data-testid="voice-enroll">
      <div className="flex items-center gap-2">
        <span className="text-gray-100 font-medium">Voice enrollment for {person.displayName}</span>
        <span className="text-gray-500">identifies who is talking to the kiosk; it never unlocks or approves anything</span>
      </div>
      {!step && (
        <>
          <label className="block text-[11px] text-gray-400">Record at
            <select value={choice} onChange={e => setChoice(Number(e.target.value))} className="ml-2 text-xs bg-gray-800 text-gray-100 rounded px-2 py-1">
              {choices.map((c, i) => (
                <option key={`${c.h.hostId}:${c.k.agentId}:${c.k.key}`} value={i} disabled={!c.k.online}>
                  {c.k.name} ({c.k.agentName}, {c.h.hostName}){c.k.online ? '' : ' - offline'}
                </option>
              ))}
            </select>
          </label>
          <blockquote className="max-w-2xl border-l-2 border-violet-500/60 pl-3 text-gray-200 whitespace-pre-wrap">{picked?.h.consentText}</blockquote>
          <label className="flex items-center gap-2 text-gray-300">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            {person.displayName} read this text and agrees. The date is stored with the voiceprint.
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep({ at: 0, busy: false, error: null, done: false })} disabled={!agreed || !picked?.k.online} className="px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Start</button>
            <button onClick={onClose} className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Cancel</button>
          </div>
          <div className="text-[10px] text-gray-500">The consent text is set in Settings, Voice. Only the voiceprint is kept, never the recordings.</div>
        </>
      )}
      {step && !step.done && (
        <>
          <div className="text-gray-400">Sentence {Math.min(step.at + 1, sentences.length)} of {sentences.length}. {step.busy ? 'Recording for 5 seconds: read it aloud at the kiosk now.' : 'Press Record, then read it aloud at the kiosk.'}</div>
          <div className="text-base text-gray-100">&ldquo;{sentences[step.at]}&rdquo;</div>
          {step.error && <div className="text-red-300">{step.error}</div>}
          <div className="flex gap-2">
            <button onClick={() => record(step.at)} disabled={step.busy || (step.at === 0 && !agreed)} className="px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              {step.busy ? 'Recording…' : 'Record'}
            </button>
            <button onClick={onClose} disabled={step.busy} className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50">Cancel</button>
          </div>
        </>
      )}
      {step?.done && (
        <>
          <div className="text-emerald-300">Enrolled: {person.displayName}&apos;s voiceprint is stored on {picked?.h.hostName}.</div>
          <button onClick={onClose} className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Close</button>
        </>
      )}
    </div>
  )
}
