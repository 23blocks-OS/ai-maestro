'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, KeyRound, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react'

interface ClassifierView {
  provider: 'jev'
  url: string
  model: string
  minDurable: number
  minImportance: number
  configured: boolean
  apiKeyHint: string | null
}

export default function MemorySection() {
  const [stored, setStored] = useState<ClassifierView | null>(null)
  const [url, setUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [minDurable, setMinDurable] = useState(0.85)
  const [minImportance, setMinImportance] = useState(3)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const apply = (c: ClassifierView) => {
    setStored(c)
    setUrl(c.url)
    setModel(c.model)
    setMinDurable(c.minDurable)
    setMinImportance(c.minImportance)
    setApiKey('')
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/memory')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      apply((await res.json()).classifier)
    } catch (err) {
      setStatus({ ok: false, message: `Could not load settings: ${(err as Error).message}` })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const form = () => ({ classifier: { url, model, apiKey, minDurable, minImportance } })

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form()),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`)
      apply(data.classifier)
      setStatus({ ok: true, message: 'Saved' })
    } catch (err) {
      setStatus({ ok: false, message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings/memory/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form()),
      })
      const data = await res.json()
      setStatus({ ok: Boolean(data.ok), message: data.message || `HTTP ${res.status}` })
    } catch (err) {
      setStatus({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const removeKey = async () => {
    setStatus(null)
    const res = await fetch('/api/settings/memory', { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.classifier) {
      apply(data.classifier)
      setStatus({ ok: true, message: 'API key removed' })
    } else {
      setStatus({ ok: false, message: data.message || `HTTP ${res.status}` })
    }
  }

  const inputClass = 'w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Memory</h1>
        </div>
        <p className="text-gray-400">
          Long-term memory classifies passages of each conversation (your messages, and each paragraph of the agent&apos;s replies)
          with a System One model (Jev by default). It keeps the ones that are decisions, facts, preferences, patterns,
          insights or reasoning, word for word.
          Use your own API key. It is stored only on this host and never sent back to the browser.
        </p>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Classifier</h3>
          {stored && (
            <span className={`text-xs px-2 py-1 rounded-full ${stored.configured ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              {stored.configured ? 'Configured' : 'No API key: memory consolidation is off'}
            </span>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">API URL</label>
          <input className={inputClass} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.typesafe.ai" />
          <p className="text-xs text-gray-500 mt-1">Any Jev-compatible endpoint. Requests go to <code>{'{url}'}/v1/systemone</code>.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
          <input className={inputClass} value={model} onChange={e => setModel(e.target.value)} placeholder="jev-latest" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">API key</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoComplete="off"
                className={`${inputClass} pl-9`}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={stored?.apiKeyHint ? `Stored key ${stored.apiKeyHint}. Leave blank to keep it.` : 'Paste your API key'}
              />
            </div>
            {stored?.apiKeyHint && (
              <button onClick={removeKey} className="px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40" title="Remove stored key">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Minimum &ldquo;worth remembering&rdquo; probability</label>
            <input type="number" step="0.05" min="0" max="1" className={inputClass} value={minDurable} onChange={e => setMinDurable(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Minimum importance (0 to 4)</label>
            <input type="number" step="0.5" min="0" max="4" className={inputClass} value={minImportance} onChange={e => setMinImportance(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={test} disabled={testing} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-200 hover:border-gray-500 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            Test connection
          </button>
          {status && (
            <span className={`flex items-center gap-1.5 text-sm ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
              {status.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {status.message}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-800/30 rounded-xl border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">When memory runs</h4>
        <p className="text-xs text-gray-500">
          Each agent consolidates nightly between 2:00 and 2:30 AM, or when you click Consolidate in its Memory tab.
          Each run picks up where the last one stopped and classifies at most 1,000 passages per agent.
          These settings apply to every agent on this host.
        </p>
      </div>
    </div>
  )
}
