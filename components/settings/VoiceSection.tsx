'use client'

/**
 * The text a person agrees to before their voiceprint is made (#78). Each host that keeps voiceprints has its own,
 * because the wording depends on where the kiosk is and who uses it.
 */

import { useEffect, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useVoiceHosts } from '@/components/VoiceEnrollment'

export default function VoiceSection() {
  const { hosts } = useHosts()
  const { voiceHosts, reloadVoice } = useVoiceHosts(hosts)
  const [hostId, setHostId] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const picked = voiceHosts.find(h => h.hostId === hostId) ?? voiceHosts.find(h => h.ready) ?? voiceHosts[0]

  useEffect(() => { if (picked) setText(picked.consentText) }, [picked?.hostId, picked?.consentText]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (value: string) => {
    if (!picked) return
    setNote(null)
    const res = await fetch(`${picked.base}/api/voiceprints`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consentText: value }) })
    const body = await res.json().catch(() => ({}))
    setNote(res.ok ? 'Saved. People enrolled from now on agree to this text.' : body.message || `Could not save (${res.status})`)
    reloadVoice()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><AudioLines className="w-6 h-6" /> Voice</h1>
        <p className="text-gray-400 text-sm">
          A kiosk can tell its agent who is probably speaking, from a voiceprint the person agreed to. This names a person;
          it never unlocks or approves anything. Enroll people from the People page.
        </p>
      </div>
      {!picked ? (
        <div className="text-sm text-gray-500">No host answered. Voiceprints need AI Maestro 0.106.209 or later.</div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-3">
          <label className="block text-xs text-gray-400">Host
            <select value={picked.hostId} onChange={e => setHostId(e.target.value)} className="ml-2 text-xs bg-gray-800 text-gray-100 rounded px-2 py-1">
              {voiceHosts.map(h => <option key={h.hostId} value={h.hostId}>{h.hostName}{h.ready ? '' : ' (speaker model not installed)'}</option>)}
            </select>
          </label>
          {!picked.ready && <div className="text-xs text-amber-300">This host cannot make voiceprints yet: run scripts/install-voice.sh there.</div>}
          <div>
            <div className="text-sm font-medium text-gray-100">Consent text</div>
            <div className="text-xs text-gray-400 mt-0.5">Shown before enrollment, and stored with each voiceprint. Write it for your country and your users; the default is only a start.</div>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} maxLength={2000}
            className="w-full text-sm bg-gray-800 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-600" />
          <div className="flex items-center gap-2">
            <button onClick={() => save(text)} disabled={!text.trim() || text === picked.consentText} className="text-xs px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Save</button>
            <button onClick={() => save('')} className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Restore the default</button>
            {note && <span className="text-xs text-gray-400">{note}</span>}
          </div>
          <div className="text-xs text-gray-500">{picked.voiceprints.length} {picked.voiceprints.length === 1 ? 'person is' : 'people are'} enrolled on {picked.hostName}.</div>
        </div>
      )}
    </div>
  )
}
