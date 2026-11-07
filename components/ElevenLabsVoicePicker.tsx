'use client'

import { useEffect, useState } from 'react'

interface Voice { id: string; name: string; category?: string; previewUrl?: string }

/** The voices of the key on the agent's own host. A voice is saved by its id; a person sees its name. */
export default function ElevenLabsVoicePicker({ baseUrl, voiceId, onPick }: { baseUrl: string; voiceId?: string; onPick: (id: string) => void }) {
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let gone = false
    fetch(`${baseUrl}/api/voice/elevenlabs/voices`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (gone) return
        if (res.ok) setVoices(body.voices)
        else setError(body.error === 'no_key' ? 'This host has no ElevenLabs key. Add it there with: aim-secret set ELEVENLABS_API_KEY' : body.message || 'Could not read the voices.')
      })
      .catch(() => { if (!gone) setError('Could not reach this host.') })
    return () => { gone = true }
  }, [baseUrl])

  if (error) return <p role="status" className="text-xs text-amber-300">{error}</p>
  if (!voices) return <p className="text-xs text-gray-500">Loading voices…</p>
  const chosen = voices.find((v) => v.id === voiceId)
  return (
    <div className="space-y-2">
      <label className="block text-xs text-gray-400">
        Voice
        <select value={voiceId ?? ''} onChange={(e) => e.target.value && onPick(e.target.value)} className="block w-full mt-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100">
          <option value="">Choose a voice</option>
          {voiceId && !chosen && <option value={voiceId}>{voiceId} (not on this key)</option>}
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.category ? ` (${v.category})` : ''}</option>)}
        </select>
      </label>
      {chosen?.previewUrl && <audio controls src={chosen.previewUrl} className="w-full h-8" aria-label={`Preview of ${chosen.name}`} />}
    </div>
  )
}
