'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Terminal } from 'lucide-react'

export type ChatOrTerminal = 'chat' | 'terminal'

const keyFor = (view: string) => `aimaestro-view-${view}`

/** Read a remembered choice; anything else (or no storage) is the default */
export function readViewChoice(view: string, fallback: ChatOrTerminal): ChatOrTerminal {
  try {
    const v = localStorage.getItem(keyFor(view))
    return v === 'chat' || v === 'terminal' ? v : fallback
  } catch { return fallback }
}

/**
 * Chat or terminal for one view (F111), remembered per view. Starts on the default so the server render and the
 * first client render agree, then takes the remembered value.
 */
export function useChatOrTerminal(view: string, fallback: ChatOrTerminal = 'chat'): [ChatOrTerminal, (v: ChatOrTerminal) => void] {
  const [mode, setMode] = useState<ChatOrTerminal>(fallback)
  useEffect(() => { setMode(readViewChoice(view, fallback)) }, [view, fallback])
  const choose = useCallback((v: ChatOrTerminal) => {
    setMode(v)
    try { localStorage.setItem(keyFor(view), v) } catch { /* private window: the choice lasts this visit */ }
    // A terminal shown again must refit to its box
    if (v === 'terminal') setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
  }, [view])
  return [mode, choose]
}

/** The Chat | Terminal control, for views that have no tab bar of their own */
export default function ChatTerminalSwitch({ mode, onChange, className = '' }: { mode: ChatOrTerminal; onChange: (v: ChatOrTerminal) => void; className?: string }) {
  const btn = (v: ChatOrTerminal, label: string, Icon: typeof Terminal) => (
    <button type="button" aria-pressed={mode === v} onClick={() => onChange(v)} data-testid={`switch-${v}`}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${mode === v ? 'bg-gray-700 text-gray-50' : 'text-gray-400 hover:text-gray-200'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
  return (
    <div role="group" aria-label="Show chat or terminal" className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-900/80 border border-gray-700 ${className}`}>
      {btn('chat', 'Chat', MessageSquare)}
      {btn('terminal', 'Terminal', Terminal)}
    </div>
  )
}
