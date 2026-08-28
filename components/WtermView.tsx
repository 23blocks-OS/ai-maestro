'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { Session } from '@/types/session'

interface WtermViewProps {
  session: Session
}

export default function WtermView({ session }: WtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wtermRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/term?name=${encodeURIComponent(session.id)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.type) return
      } catch {
        // Not JSON — terminal data
      }
      const wt = wtermRef.current
      if (!wt) return
      wt.write(event.data)
      // Always scroll to bottom — especially important during initial history dump
      const el = wt.element as HTMLElement
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight
        })
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
    }
  }, [session.id])

  useEffect(() => {
    if (!containerRef.current) return

    let destroyed = false
    let styleEl: HTMLStyleElement | null = null
    let resizeObserver: ResizeObserver | null = null

    async function init() {
      const { WTerm } = await import('@wterm/dom')

      if (destroyed || !containerRef.current) return

      // Inject scoped CSS — removed on cleanup so it doesn't leak to Terminal v1
      if (!document.querySelector('style[data-wterm-scoped]')) {
        styleEl = document.createElement('style')
        styleEl.setAttribute('data-wterm-scoped', 'true')
        styleEl.textContent = getWtermScopedCSS()
        document.head.appendChild(styleEl)
      }

      // Disable wterm's built-in autoResize — we handle it ourselves
      // because wterm's ResizeObserver can race with flex layout
      const wt = new WTerm(containerRef.current, {
        autoResize: false,
        cursorBlink: true,
        onData: (data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(data)
          }
        },
        onResize: (cols: number, rows: number) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
          }
        },
      })

      await wt.init()
      if (destroyed) { wt.destroy(); return }

      wtermRef.current = wt

      // Our own ResizeObserver on the container — fires after layout settles
      function fitToContainer() {
        if (!containerRef.current || !wtermRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        const measured = (wtermRef.current as any)._measureCharSize?.()
        if (!measured) return

        const cs = getComputedStyle(containerRef.current)
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)

        const cols = Math.max(1, Math.floor((rect.width - padX) / measured.charWidth))
        const rows = Math.max(1, Math.floor((rect.height - padY) / measured.rowHeight))

        if (cols !== (wtermRef.current as any).cols || rows !== (wtermRef.current as any).rows) {
          wtermRef.current.resize(cols, rows)
        }
      }

      resizeObserver = new ResizeObserver(() => {
        fitToContainer()
      })
      resizeObserver.observe(containerRef.current)

      // Also fit after a short delay to catch any late layout
      setTimeout(fitToContainer, 50)
      setTimeout(fitToContainer, 200)

      setReady(true)
    }

    init().catch(err => {
      console.error('[wterm] Init failed:', err)
      setError('Failed to initialize wterm: ' + String(err))
    })

    return () => {
      destroyed = true
      if (resizeObserver) resizeObserver.disconnect()
      wtermRef.current?.destroy()
      wtermRef.current = null
      if (styleEl) {
        styleEl.remove()
        styleEl = null
      }
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [ready, connect])

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-cyan-400 font-medium">wterm v2</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-500">{session.id}</span>
        {error && <span className="text-red-400 ml-auto">{error}</span>}
        <span className="ml-auto text-gray-600 italic">DOM rendering · native select/copy/find</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden wterm-embed" />
    </div>
  )
}

function getWtermScopedCSS(): string {
  return `
    .wterm-embed.wterm {
      --term-fg: #d4d4d4;
      --term-bg: #0a0a0a;
      --term-cursor: #aeafad;
      --term-color-0: #1e1e1e;
      --term-color-1: #f44747;
      --term-color-2: #6a9955;
      --term-color-3: #d7ba7d;
      --term-color-4: #569cd6;
      --term-color-5: #c586c0;
      --term-color-6: #4ec9b0;
      --term-color-7: #d4d4d4;
      --term-color-8: #808080;
      --term-color-9: #f44747;
      --term-color-10: #6a9955;
      --term-color-11: #d7ba7d;
      --term-color-12: #569cd6;
      --term-color-13: #c586c0;
      --term-color-14: #4ec9b0;
      --term-color-15: #ffffff;
      --term-font-family: 'Menlo', 'Consolas', 'DejaVu Sans Mono', 'Courier New', monospace;
      --term-font-size: 13px;
      --term-line-height: 1.25;
      --term-row-height: 17px;
      position: relative;
      background: var(--term-bg);
      color: var(--term-fg);
      font-family: var(--term-font-family);
      font-size: var(--term-font-size);
      line-height: var(--term-line-height);
      padding: 4px 8px;
      border-radius: 0;
      box-shadow: none;
      outline: none;
      overflow: hidden;
      width: 100%;
      height: 100%;
    }
    .wterm-embed.wterm:focus,
    .wterm-embed.wterm:focus-visible {
      outline: none;
    }
    .wterm-embed .term-grid {
      display: block;
      white-space: pre;
      contain: layout paint style;
      will-change: contents;
    }
    .wterm-embed .term-row {
      display: block;
      height: var(--term-row-height);
      line-height: var(--term-row-height);
      contain: layout style;
    }
    .wterm-embed .term-row > span {
      display: inline-block;
      height: var(--term-row-height);
      vertical-align: top;
    }
    .wterm-embed .term-block {
      width: 1ch;
      overflow: hidden;
    }
    .wterm-embed .term-cursor {
      outline: 1px solid var(--term-cursor);
      outline-offset: -1px;
    }
    .wterm-embed.wterm.focused .term-cursor {
      background: var(--term-cursor);
      color: var(--term-bg);
      outline: none;
    }
    .wterm-embed.wterm.focused.cursor-blink .term-cursor {
      animation: wterm-cursor-blink 1s step-end infinite;
    }
    @keyframes wterm-cursor-blink {
      0%, 100% { background: var(--term-cursor); color: var(--term-bg); }
      50% { background: transparent; color: inherit; }
    }
    .wterm-embed.wterm.has-scrollback {
      overflow-y: auto;
    }
    .wterm-embed.wterm ::selection {
      background: rgba(86, 156, 214, 0.3);
    }
  `
}
