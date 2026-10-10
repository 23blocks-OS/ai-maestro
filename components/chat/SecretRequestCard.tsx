'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { SecretRequestItem } from '@/hooks/useSecretRequests'
import { answerSecretRequestApi, type AnswerBody } from '@/lib/secret-request-api'

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/

interface Props {
  agentId: string
  request: SecretRequestItem
  /** Called after the request was stored or declined, so the list refreshes. */
  onDone: () => void
}

/**
 * An agent asked the user for a credential (F033). The value goes from this field to the
 * AI Maestro server and into the local vault. It is not a chat message: it is not saved in
 * the draft, the transcript or the browser, and the agent is told only the name.
 */
export default function SecretRequestCard({ agentId, request, onDone }: Props) {
  const [name, setName] = useState(request.name)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const nameOk = NAME_RE.test(name)

  async function answer(body: AnswerBody) {
    setBusy(true)
    setError(null)
    const result = await answerSecretRequestApi(agentId, request.id, body)
    setValue('') // the value never stays in the page
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Could not save it.')
      return
    }
    setDone(result.declined ? 'Declined. The agent was told.' : `Stored ${result.name || name}. The agent was told.`)
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
    <div className="flex justify-start" data-testid="secret-request-card">
      <div className="max-w-[92%] min-w-0 w-full sm:w-[28rem]">
        <form
          className="rounded-2xl px-4 py-3 bg-sky-900/30 border border-sky-600/50 text-sky-100"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && nameOk && value.length > 0) void answer({ value, name })
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-4 h-4 text-sky-300 flex-shrink-0" />
            <span className="text-xs font-medium text-sky-300">An agent needs a credential</span>
          </div>
          <p className="text-xs text-sky-100/80 mb-2">
            It goes to your local vault. It is not sent to the chat or the model; the agent is only told the name.
            {request.note ? <span className="block mt-1 text-sky-200/70">Why: {request.note}</span> : null}
          </p>
          <label className="block text-[11px] text-sky-300/80 mb-0.5" htmlFor={`secret-name-${request.id}`}>Name</label>
          <input
            id={`secret-name-${request.id}`}
            className={`w-full mb-2 rounded-md bg-gray-950/60 border px-2 py-1.5 text-sm font-mono text-gray-100 focus:outline-none focus:ring-1 ${nameOk ? 'border-gray-700 focus:ring-sky-500' : 'border-red-600 focus:ring-red-500'}`}
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!nameOk}
          />
          <label className="block text-[11px] text-sky-300/80 mb-0.5" htmlFor={`secret-value-${request.id}`}>Value</label>
          <input
            id={`secret-value-${request.id}`}
            type="password"
            className="w-full mb-2 rounded-md bg-gray-950/60 border border-gray-700 px-2 py-1.5 text-sm font-mono text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            data-lpignore="true"
            data-1p-ignore="true"
            autoFocus
          />
          {!nameOk && <p className="text-[11px] text-red-300 mb-2">Use capital letters, digits and underscores, like OPENAI_API_KEY.</p>}
          {error && <p className="text-[11px] text-red-300 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !nameOk || value.length === 0}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-sky-600 text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Store it'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer({ decline: true })}
              className="px-3 py-1.5 rounded-md text-xs text-gray-300 border border-gray-600 disabled:opacity-40"
            >
              No thanks
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
