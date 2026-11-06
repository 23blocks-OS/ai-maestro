'use client'

/** The search button, field and results of a chat, and the lines between messages. Used by both views. */
import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { dayLabel, messageTime, type ChatDivider } from '@/lib/chat-utils'
import type { ChatFindState } from '@/hooks/useChatFind'

export function ChatDividerLine({ divider }: { divider: ChatDivider }) {
  return (
    <div className="flex justify-center my-3" {...(divider.found ? { 'data-chat-found': '' } : {})}>
      <span className={`px-3 py-0.5 rounded-full text-xs ${divider.found ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>{divider.label}</span>
    </div>
  )
}

export function ChatFind({ find }: { find: ChatFindState }) {
  const input = useRef<HTMLInputElement>(null)
  const { open, setOpen, query, setQuery, results, total, status, pick } = find

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Search this conversation" aria-label="Search this conversation" className="absolute top-2 right-3 z-20 p-1.5 rounded-full bg-gray-800/90 hover:bg-gray-700 text-gray-300">
        <Search className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className="absolute top-0 inset-x-0 z-20 bg-gray-900 border-b border-gray-700 shadow-lg" data-testid="chat-find">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <input
          ref={input}
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          placeholder="Search this conversation"
          aria-label="Search this conversation"
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-100 outline-none"
        />
        <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="p-1 text-gray-400 hover:text-gray-200"><X className="w-4 h-4" /></button>
      </div>
      {status === 'searching' && <p className="px-3 pb-2 text-xs text-gray-500">Searching…</p>}
      {status === 'failed' && <p role="alert" className="px-3 pb-2 text-xs text-red-300">The search did not work. This host may need a newer AI Maestro.</p>}
      {status === 'idle' && results?.length === 0 && <p className="px-3 pb-2 text-xs text-gray-500">Nothing found</p>}
      {results && results.length > 0 && (
        <ul className="max-h-72 overflow-y-auto border-t border-gray-800">
          {results.map((r) => (
            <li key={r.index}>
              <button type="button" onClick={() => pick(r)} className="w-full text-left px-3 py-2 hover:bg-gray-800">
                <span className="block text-xs text-gray-500">{r.type === 'user' ? 'You' : 'Agent'}{r.timestamp ? ` · ${dayLabel(r.timestamp)} ${messageTime(r.timestamp)}` : ''}</span>
                <span className="block text-sm text-gray-200 break-words">{r.snippet}</span>
              </button>
            </li>
          ))}
          {total > results.length && <li className="px-3 py-2 text-xs text-gray-500">Showing the newest {results.length} of {total}</li>}
        </ul>
      )}
    </div>
  )
}
