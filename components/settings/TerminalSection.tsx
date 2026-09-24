'use client'

/**
 * Terminal preferences that used to sit in the terminal header as buttons
 * (v0.45.4): Auto-copy is set once, not used every time; the scroll keys are
 * reference, not live data.
 */

import { useEffect, useState } from 'react'
import { SquareTerminal, ToggleLeft, ToggleRight } from 'lucide-react'

const COPY_ON_SELECT_KEY = 'terminal-copy-on-select'

export default function TerminalSection() {
  const [copyOnSelect, setCopyOnSelect] = useState(false)
  useEffect(() => {
    try { setCopyOnSelect(localStorage.getItem(COPY_ON_SELECT_KEY) === 'true') } catch { /* private mode */ }
  }, [])
  const toggle = () => {
    const next = !copyOnSelect
    setCopyOnSelect(next)
    try { localStorage.setItem(COPY_ON_SELECT_KEY, String(next)) } catch { /* private mode */ }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <SquareTerminal className="w-6 h-6" /> Terminal
        </h1>
        <p className="text-gray-400 text-sm">How the agents&apos; terminals behave in this browser.</p>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-100">Copy on select</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Selecting text in a terminal copies it to the clipboard right away. Off: select, then use Copy in the terminal header.
          </div>
        </div>
        <button onClick={toggle} className={copyOnSelect ? 'text-emerald-400' : 'text-gray-500'} aria-pressed={copyOnSelect} title={copyOnSelect ? 'On' : 'Off'}>
          {copyOnSelect ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="mt-4 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-100 mb-2">Scrolling</div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs text-gray-400">
          <dt className="font-mono text-gray-300">Mouse wheel</dt><dd>scroll</dd>
          <dt className="font-mono text-gray-300">Shift + PgUp / PgDn</dt><dd>one page</dd>
          <dt className="font-mono text-gray-300">Shift + ↑ / ↓</dt><dd>five lines</dd>
          <dt className="font-mono text-gray-300">Shift + Home / End</dt><dd>top / bottom</dd>
        </dl>
      </div>
    </div>
  )
}
