'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import TerminalView from '@/components/TerminalView'
import TomlPreviewPanel from '@/components/TomlPreviewPanel'
import HaephestosLeftPanel from '@/components/HaephestosLeftPanel'
import { useDeviceType } from '@/hooks/useDeviceType'
import { agentToSession } from '@/lib/agent-utils'
import { Loader2, X, Hammer, FileText, Eye } from 'lucide-react'
import type { Agent } from '@/types/agent'

const SESSION_NAME = '_aim-creation-helper'
const TOML_DRAFT_PATH = '~/.aimaestro/tmp/haephestos-draft.toml'

type PageState = 'creating' | 'ready' | 'error' | 'destroying' | 'finalizing'

export default function AgentCreationPage() {
  const router = useRouter()
  const { deviceType } = useDeviceType()
  const isMobile = deviceType === 'phone'
  const isTablet = deviceType === 'tablet'
  const isCompact = isMobile || isTablet

  const [pageState, setPageState] = useState<PageState>('creating')
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [tomlPath] = useState(TOML_DRAFT_PATH)
  const [files, setFiles] = useState<Array<{ path: string; filename: string }>>([])
  const [mobilePanel, setMobilePanel] = useState<'none' | 'files' | 'toml'>('none')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const destroyingRef = useRef(false)

  // Create the Haephestos session on mount
  useEffect(() => {
    let cancelled = false

    async function createSession() {
      try {
        const res = await fetch('/api/sessions/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: SESSION_NAME,
            program: 'claude-code',
            programArgs: '--agent haephestos-creation-helper',
            label: 'Haephestos',
          }),
        })

        if (cancelled) return

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to create session' }))
          // Session may already exist — try to fetch the agent
          if (res.status === 409 || data.error?.includes('already exists')) {
            await fetchAgent()
            return
          }
          setError(data.error || 'Failed to create Haephestos session')
          setPageState('error')
          return
        }

        await fetchAgent()
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to create session')
        setPageState('error')
      }
    }

    async function fetchAgent() {
      // Poll for the agent to appear in the sessions list
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch('/api/sessions')
          if (!res.ok) continue
          const data = await res.json()
          const agents: Agent[] = data.agents || data.sessions || []
          const found = agents.find(
            (a: Agent) => a.name === SESSION_NAME || a.session?.tmuxSessionName === SESSION_NAME
          )
          if (found) {
            if (cancelled) return
            setAgent(found)
            setPageState('ready')
            return
          }
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 1000))
      }
      if (!cancelled) {
        setError('Haephestos session created but agent not found')
        setPageState('error')
      }
    }

    createSession()
    return () => { cancelled = true }
  }, [])

  // Destroy session + cleanup on unmount (if not already destroyed by Cancel/Create)
  useEffect(() => {
    return () => {
      if (!destroyingRef.current) {
        fetch('/api/sessions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: SESSION_NAME }),
        }).catch(() => {})
        fetch('/api/agents/creation-helper/cleanup', { method: 'POST' }).catch(() => {})
      }
    }
  }, [])

  const handleCancel = useCallback(async () => {
    destroyingRef.current = true
    setPageState('destroying')
    try {
      await Promise.allSettled([
        fetch('/api/sessions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: SESSION_NAME }),
        }),
        fetch('/api/agents/creation-helper/cleanup', { method: 'POST' }),
      ])
    } catch { /* best-effort cleanup */ }
    router.push('/')
  }, [router])

  const handleCreate = useCallback(async () => {
    setPageState('finalizing')

    try {
      // 1. Read the draft TOML to extract agent name and config
      const tomlRes = await fetch(
        `/api/agents/creation-helper/toml-preview?path=${encodeURIComponent(TOML_DRAFT_PATH)}`
      )
      const tomlData = await tomlRes.json()

      if (!tomlData.exists || !tomlData.content?.trim()) {
        setError('No agent profile found. Chat with Haephestos to generate one first.')
        setPageState('error')
        return
      }

      // Parse agent name from TOML (simple extraction — name = "...")
      const nameMatch = tomlData.content.match(/^name\s*=\s*"([^"]+)"/m)
      const agentName = nameMatch?.[1]
      if (!agentName) {
        setError('Agent profile is missing a name. Ask Haephestos to add one.')
        setPageState('error')
        return
      }

      // Parse optional fields
      const modelMatch = tomlData.content.match(/^model\s*=\s*"([^"]+)"/m)
      const wdMatch = tomlData.content.match(/^workingDirectory\s*=\s*"([^"]+)"/m)
      const programMatch = tomlData.content.match(/^program\s*=\s*"([^"]+)"/m)

      // 2. Create the actual agent session
      const createRes = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          program: programMatch?.[1] || 'claude-code',
          programArgs: modelMatch?.[1] ? `--model ${modelMatch[1]}` : undefined,
          workingDirectory: wdMatch?.[1] || undefined,
          label: agentName,
        }),
      })

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({ error: 'Failed to create agent' }))
        setError(errData.error || 'Failed to create agent')
        setPageState('error')
        return
      }

      // 3. Destroy the Haephestos session and clean up
      destroyingRef.current = true
      await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: SESSION_NAME }),
      }).catch(() => {})

      // Clean up temp files
      await fetch('/api/agents/creation-helper/cleanup', {
        method: 'POST',
      }).catch(() => {})

      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
      setPageState('error')
    }
  }, [router])

  const handleRemoveFile = useCallback((path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
  }, [])

  const handleFileUploaded = useCallback((path: string, filename: string) => {
    setFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, filename }]
    })
  }, [])

  // Loading state
  if (pageState === 'creating' || pageState === 'destroying' || pageState === 'finalizing') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        <p className="text-sm text-gray-400">
          {pageState === 'creating' ? 'Firing up the forge…' : pageState === 'finalizing' ? 'Forging your agent…' : 'Shutting down…'}
        </p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-4 px-6">
        <Hammer className="w-12 h-12 text-red-400" />
        <p className="text-sm text-red-400 text-center max-w-md">{error}</p>
        <div className="flex items-center gap-3">
          {agent && (
            <button
              onClick={() => { setError(null); setPageState('ready') }}
              className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-500"
            >
              Back to Terminal
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (!agent) return null

  const session = agentToSession(agent)

  // Mobile layout
  if (isCompact) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col" style={{ height: '100dvh' }}>
        {/* Header */}
        <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hammer className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Haephestos</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMobilePanel(mobilePanel === 'files' ? 'none' : 'files')}
              className={`p-2 rounded-lg transition-colors ${
                mobilePanel === 'files' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Attached files"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobilePanel(mobilePanel === 'toml' ? 'none' : 'toml')}
              className={`p-2 rounded-lg transition-colors ${
                mobilePanel === 'toml' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Profile preview"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile panel slide-up */}
        {mobilePanel !== 'none' && (
          <div className="border-b border-gray-700 bg-gray-900 max-h-[40vh] overflow-y-auto">
            {mobilePanel === 'files' ? (
              <HaephestosLeftPanel
                files={files}
                onRemoveFile={handleRemoveFile}
                onClose={() => setMobilePanel('none')}
              />
            ) : (
              <TomlPreviewPanel
                tomlPath={tomlPath}
                onClose={() => setMobilePanel('none')}
              />
            )}
          </div>
        )}

        {/* Terminal */}
        <main className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <TerminalView
            session={session}
            isVisible={true}
            onFileUploaded={handleFileUploaded}
          />
        </main>

        {/* Action bar */}
        <footer className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-3 py-2 flex items-center justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white font-medium hover:bg-amber-500"
          >
            Create Agent
          </button>
        </footer>
      </div>
    )
  }

  // Desktop layout
  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Hammer className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Haephestos</span>
          <span className="text-xs text-gray-500">Agent Creator</span>
        </div>
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Main content: left panel + terminal + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — avatar + files */}
        <aside className="w-20 flex-shrink-0 border-r border-gray-800 bg-gray-900 overflow-y-auto">
          <HaephestosLeftPanel
            files={files}
            onRemoveFile={handleRemoveFile}
          />
        </aside>

        {/* Terminal area */}
        <main className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <TerminalView
            session={session}
            isVisible={true}
            onFileUploaded={handleFileUploaded}
          />
        </main>

        {/* Right panel — TOML preview */}
        {rightPanelOpen && (
          <aside className="w-72 flex-shrink-0 border-l border-gray-800 bg-gray-900 overflow-hidden">
            <TomlPreviewPanel
              tomlPath={tomlPath}
              onClose={() => setRightPanelOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Action bar */}
      <footer className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Show Preview
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-sm rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-1.5 text-sm rounded-md bg-amber-600 text-white font-medium hover:bg-amber-500"
          >
            Create Agent
          </button>
        </div>
      </footer>
    </div>
  )
}
