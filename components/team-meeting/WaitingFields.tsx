'use client'

import type { Agent } from '@/types/agent'

/** Who a card waits on: the operator, someone outside, on hold, or one of the agents. */
export default function WaitingFields({
  agents, on, note, onChange,
}: {
  agents: Agent[]
  on: string
  note: string
  onChange: (next: { on: string; note: string }) => void
}) {
  return (
    <div className="space-y-1.5" data-testid="waiting-fields">
      <select
        value={on}
        onChange={e => onChange({ on: e.target.value, note })}
        className="w-full text-[11px] bg-gray-800/50 text-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
        aria-label="Waiting on"
      >
        <option value="juan">Waiting on you</option>
        <option value="outside">Waiting on someone outside</option>
        <option value="hold">On hold</option>
        {agents.length > 0 && (
          <optgroup label="Waiting on an agent">
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.label || a.name || a.alias || a.id.slice(0, 8)}</option>
            ))}
          </optgroup>
        )}
      </select>
      <input
        type="text"
        value={note}
        onChange={e => onChange({ on, note: e.target.value })}
        placeholder="What exactly? (optional)"
        maxLength={200}
        className="w-full text-[11px] bg-gray-800/50 text-gray-300 placeholder-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
      />
    </div>
  )
}
