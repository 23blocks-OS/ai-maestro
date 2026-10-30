'use client'

/**
 * "Reports to": the person and/or agent an agent reports to, and the agents that report to it. Used by the
 * agent profile and the World view. The person is chosen from the People directory and stored as their id,
 * which is what the mobile app compares with "me".
 */

import { useState } from 'react'
import { Pencil } from 'lucide-react'

export interface ManagerView {
  /** A person id from the directory, or older free text */
  humanManager?: string
  /** The person's name when `humanManager` is a directory id */
  humanManagerName?: string
  /** People in the directory (every host), to choose from */
  people: Array<{ id: string; name: string }>
  manager: { id: string; name: string } | null
  reports: Array<{ id: string; name: string }>
  /** From the agent's owner; offered, never applied on its own */
  suggestion: { humanManager?: string; managerAgentId?: string; label: string } | null
  /** Every agent that could be its manager (not itself) */
  choices: Array<{ id: string; name: string }>
}

/** Who this agent reports to, who reports to it, and a way to change it. An agent needs a person, an agent, or both. */
export function ManagerSection({ view, onGo, onSave }: {
  view: ManagerView
  onGo: (id: string) => void
  onSave: (patch: { humanManager?: string | null; managerAgentId?: string | null }) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [human, setHuman] = useState('')
  const [agentId, setAgentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const none = !view.humanManager && !view.manager
  const legacyText = view.humanManager && !view.people.some(p => p.id === view.humanManager) ? view.humanManager : null

  const open = () => { setHuman(view.humanManager ?? ''); setAgentId(view.manager?.id ?? ''); setError(null); setEditing(true) }
  const save = async () => {
    setBusy(true)
    const err = await onSave({ humanManager: human.trim() || null, managerAgentId: agentId || null })
    setBusy(false)
    if (err) setError(err)
    else setEditing(false)
  }
  const useSuggestion = async () => {
    if (!view.suggestion) return
    setBusy(true)
    const err = await onSave({
      ...(view.suggestion.humanManager ? { humanManager: view.suggestion.humanManager } : {}),
      ...(view.suggestion.managerAgentId ? { managerAgentId: view.suggestion.managerAgentId } : {}),
    })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div data-testid="manager-section">
      <div className="mb-1 flex items-center gap-2">
        <p className="flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Reports to</p>
        {!editing && (
          <button onClick={open} className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300" aria-label="Change who this agent reports to" title="Change who this agent reports to">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <label className="block text-[11px] text-gray-500">Person
            <select value={human} onChange={e => setHuman(e.target.value)} data-testid="reports-to-person"
              className="mt-0.5 w-full rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100 focus:border-teal-600 focus:outline-none">
              <option value="">no one</option>
              {view.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {/* An older free-text manager stays selectable, so editing never drops it silently */}
              {legacyText && <option value={legacyText}>{legacyText} (not in the directory)</option>}
            </select>
          </label>
          <label className="block text-[11px] text-gray-500">Agent
            <select value={agentId} data-testid="reports-to-agent" onChange={e => setAgentId(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100 focus:border-teal-600 focus:outline-none">
              <option value="">no agent</option>
              {view.choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-gray-600">An agent needs a person, an agent, or both.</p>
          {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
          <div className="flex gap-1.5">
            <button onClick={save} disabled={busy} className="rounded bg-teal-600 px-2.5 py-1 text-xs text-white hover:bg-teal-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEditing(false)} className="rounded bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700">Cancel</button>
          </div>
        </div>
      ) : none ? (
        <div className="space-y-1">
          <p className="text-xs text-amber-400">No manager yet.</p>
          {view.suggestion && (
            <button onClick={useSuggestion} disabled={busy} className="rounded bg-gray-800 px-2 py-1 text-left text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-50" title="Suggested from the agent's owner">
              Use {view.suggestion.label}
            </button>
          )}
          {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
        </div>
      ) : (
        <ul className="space-y-0.5 text-xs text-gray-300">
          {view.humanManager && <li><span className="text-gray-500">Person · </span>{view.humanManagerName ?? view.humanManager}</li>}
          {view.manager && (
            <li><span className="text-gray-500">Agent · </span>
              <button onClick={() => onGo(view.manager!.id)} className="hover:text-teal-300" title="Go to this agent">{view.manager.name}</button>
            </li>
          )}
        </ul>
      )}
      {view.reports.length > 0 && (
        <p className="mt-1.5 text-xs text-gray-400">
          <span className="text-gray-500">Manages {view.reports.length} · </span>
          {view.reports.slice(0, 4).map((r, i) => (
            <span key={r.id}>{i > 0 ? ', ' : ''}<button onClick={() => onGo(r.id)} className="hover:text-teal-300">{r.name}</button></span>
          ))}
          {view.reports.length > 4 ? ` and ${view.reports.length - 4} more` : ''}
        </p>
      )}
    </div>
  )
}
