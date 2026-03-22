'use client'

/**
 * HaephestosEmbeddedView — renders the Haephestos agent creation UI
 * inside the dashboard's main content area (replacing the terminal tabs).
 *
 * This is a simplified version of app/agent-creation/page.tsx that:
 * - Does NOT manage session lifecycle (session already exists in tmux)
 * - Shows the same 3-column layout (TOML preview + terminal + avatar/raw materials)
 * - Handles heartbeat and signal polling
 * - Scales to fit the dashboard's main content area
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import TerminalView from '@/components/TerminalView'
import TomlPreviewPanel from '@/components/TomlPreviewPanel'
import HaephestosLeftPanel from '@/components/HaephestosLeftPanel'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { useDeviceType } from '@/hooks/useDeviceType'
import { agentToSession } from '@/lib/agent-utils'
import { Hammer, FileText, Eye, ScrollText, Volume2, VolumeX, LogOut } from 'lucide-react'
import type { UnifiedAgent } from '@/types/agent'

const TOML_DRAFT_PATH = '~/agents/haephestos/toml/'

// Color constants — Haephestos forge palette (same as agent-creation/page.tsx)
const PAGE_BG = '#0c0808'
const BORDER_COLOR = '#2a1818'
const FRAME_W = 8
const FRAME_RED_BASE = '#6a1a1a'
const FRAME_AMB_BASE = '#6a4a0a'
const FRAME_AMB_GRAD = 'linear-gradient(135deg, #543808 0%, #644809 25%, #745a12 50%, #684c0c 75%, #7e6018 100%)'
const FRAME_AMB_GLOW = 'rgba(160,100,10,0.3)'
const FRAME_AMB_INSET = 'inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(220,160,40,0.10)'
const TAB_GOLD_BG = '#1a1410'
const TAB_GOLD_TEXT = '#d4a530'
const TAB_GOLD_BORDER = '#5a3a10'
const TAB_AMBER_BG = '#1a1408'
const TAB_AMBER_TEXT = '#c89020'
const TAB_AMBER_BORDER = '#5a4010'
const FRAME_STEEL_BASE = '#1a2a3a'
const FRAME_STEEL_GRAD = 'linear-gradient(135deg, #142230 0%, #1a2a3a 25%, #223448 50%, #1e2e40 75%, #283a50 100%)'
const FRAME_STEEL_GLOW = 'rgba(30,80,140,0.25)'
const FRAME_STEEL_INSET = 'inset 3px 3px 8px rgba(0,0,0,0.4), inset -2px -2px 6px rgba(60,120,200,0.08)'
const TAB_STEEL_BG = '#0e1218'
const TAB_STEEL_TEXT = '#a0906a'
const TAB_STEEL_BORDER = '#2a3848'
const RAW_MAT_BG = '#0a0c12'

interface SlottedFile {
  path: string
  filename: string
  slot?: 'codebase' | 'skills' | 'context'
}

interface HaephestosEmbeddedViewProps {
  agent: UnifiedAgent
  /** Called when a new agent is created — dashboard should switch to it (which auto-hibernates haephestos) */
  onAgentCreated?: (agentId: string) => void
}

export default function HaephestosEmbeddedView({ agent, onAgentCreated }: HaephestosEmbeddedViewProps) {
  const router = useRouter()
  const { deviceType } = useDeviceType()
  const isMobile = deviceType === 'phone'
  const isOnline = agent.session?.status === 'online'

  const [waking, setWaking] = useState(false)
  const [tomlPath] = useState(TOML_DRAFT_PATH)
  const [files, setFiles] = useState<SlottedFile[]>([])
  const [mobilePanel, setMobilePanel] = useState<'none' | 'files' | 'toml'>('none')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [playingAnimation, setPlayingAnimation] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const animationVideoRef = useRef<HTMLVideoElement>(null)
  const signalDetectedRef = useRef(false)
  const [avatarIndex, setAvatarIndex] = useState(() => Math.floor(Math.random() * 55))
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const avatarUrl = `/avatars/robots_${avatarIndex.toString().padStart(2, '0')}.jpg`

  // Wake Haephestos — creates the tmux session and starts Claude
  const handleWake = useCallback(async () => {
    setWaking(true)
    try {
      // Cleanup any stale state
      await fetch('/api/agents/creation-helper/cleanup', { method: 'POST' })
      // Deploy latest persona file
      await fetch('/api/agents/creation-helper/ensure-persona', { method: 'POST' })
      // Create the session
      await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '_aim-creation-helper',
          program: 'claude-code',
          programArgs: '--agent haephestos-creation-helper',
          label: 'Haephestos',
          workingDirectory: '~/agents/haephestos',
        }),
      })
      // Session will appear online on next agent refresh (useAgents polls every 10s)
    } catch { /* ignore */ }
    finally { setWaking(false) }
  }, [])

  // Heartbeat: keep the server-side watchdog alive (only when online)
  useEffect(() => {
    if (!isOnline) return
    const heartbeatInterval = setInterval(() => {
      fetch('/api/agents/creation-helper/heartbeat', { method: 'POST' }).catch(() => {})
    }, 30_000)
    fetch('/api/agents/creation-helper/heartbeat', { method: 'POST' }).catch(() => {})
    return () => clearInterval(heartbeatInterval)
  }, [isOnline])

  // Sync raw materials state to disk so Haephestos can read it
  const rawMaterialsSyncRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(rawMaterialsSyncRef.current)
    rawMaterialsSyncRef.current = setTimeout(async () => {
      try {
        const state = {
          files: files.map(f => ({ path: f.path, filename: f.filename, slot: f.slot })),
          avatarUrl,
          personaName: '',
        }
        await fetch('/api/agents/creation-helper/raw-materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        })
      } catch { /* ignore */ }
    }, 500)
  }, [files, avatarUrl])

  // Signal polling — navigate to dashboard when agent is created
  useEffect(() => {
    if (signalDetectedRef.current) return
    let cancelled = false
    const checkSignal = async () => {
      if (signalDetectedRef.current || cancelled) return
      try {
        const res = await fetch(`/api/agents/creation-helper/toml-preview?path=${encodeURIComponent('~/agents/haephestos/creation-signal.json')}`)
        if (!res.ok) return
        const data = await res.json()
        if (!data.exists || !data.content?.trim()) return
        const signal = JSON.parse(data.content)
        if (signal.status === 'complete' && signal.personaName) {
          if (cancelled) return
          signalDetectedRef.current = true
          setPlayingAnimation(true)
          // After animation, switch to the new agent — this auto-hibernates haephestos
          // (dashboard's handleAgentSelect kills haephestos tmux when switching away)
          const newAgentId = signal.agentId
          setTimeout(() => {
            if (cancelled) return
            if (newAgentId && onAgentCreated) {
              onAgentCreated(newAgentId)
            } else {
              // Fallback: reload dashboard
              router.push('/')
            }
          }, 6000)
        }
      } catch { /* ignore */ }
    }
    const intervalId = setInterval(checkSignal, 5000)
    return () => { cancelled = true; clearInterval(intervalId) }
  }, [router])

  // File upload handler — receives (path, filename) from TerminalView's upload callback
  const handleFileUploaded = useCallback((path: string, filename: string) => {
    setFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, filename }]
    })
  }, [])

  const handleRemoveFile = useCallback((slot: string) => {
    setFiles(prev => prev.filter(f => f.slot !== slot))
  }, [])

  const handleSlotUpload = useCallback(async (slot: string, file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/agents/creation-helper/file-picker', { method: 'POST', body: formData })
      if (!res.ok) return
      const data = await res.json()
      setFiles(prev => {
        const filtered = prev.filter(f => f.slot !== slot)
        return [...filtered, { path: data.path, filename: data.filename, slot: slot as SlottedFile['slot'] }]
      })
    } catch { /* ignore */ }
  }, [])

  const handleInjectFiles = useCallback(() => {
    const slotted = files.filter(f => f.slot)
    if (slotted.length === 0) return
    const lines = ['Here are the reference files for the agent I want to create:']
    const codebase = files.find(f => f.slot === 'codebase')
    const skills = files.find(f => f.slot === 'skills')
    const context = files.find(f => f.slot === 'context')
    if (codebase) lines.push(`- Codebase Reference: ${codebase.path}`)
    if (skills) lines.push(`- Skills Catalog: ${skills.path}`)
    if (context) lines.push(`- Additional Context: ${context.path}`)
    lines.push('', 'Please read these files and use them to help design the agent profile.')
    window.dispatchEvent(new CustomEvent('haephestos-inject', { detail: { message: lines.join('\n') } }))
  }, [files])

  const session = agentToSession(agent)

  // Hibernated state — show wake button
  if (!isOnline) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <div className="text-center max-w-md px-6">
          {/* Haephestos avatar */}
          <div className="w-32 h-32 mx-auto mb-6 rounded-2xl overflow-hidden" style={{ border: `3px solid ${FRAME_RED_BASE}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/avatars/haephestos.jpg?v=20260318" alt="Haephestos" className="w-full h-full object-cover" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Haephestos</h3>
          <p className="text-sm text-gray-400 mb-6">
            The AI Agent Forge Master. Haephestos helps you create and configure new AI agents with the right skills, plugins, and settings.
          </p>
          <button
            onClick={handleWake}
            disabled={waking}
            className="px-8 py-3.5 rounded-xl font-semibold text-base transition-all disabled:opacity-50"
            style={{
              backgroundColor: '#4a2010',
              color: '#f0a040',
              border: `2px solid ${FRAME_RED_BASE}`,
              boxShadow: '0 0 20px rgba(140,30,10,0.3)',
            }}
          >
            {waking ? (
              <span className="flex items-center gap-2">
                <Hammer className="w-5 h-5 animate-spin" />
                Firing up the forge...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Hammer className="w-5 h-5" />
                Ask Haephestos Help
              </span>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Mobile layout
  if (isMobile) {
    return (
      <TerminalProvider>
        <div className="flex flex-col h-full" style={{ backgroundColor: PAGE_BG }}>
          {/* Mobile header */}
          <header className="flex-shrink-0 px-3 py-2 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backgroundColor: '#120c0c' }}>
            <div className="flex items-center gap-2">
              <Hammer className="w-5 h-5 text-amber-400" />
              <span className="text-base font-bold text-white">Haephestos</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMobilePanel(mobilePanel === 'files' ? 'none' : 'files')}
                className={`p-2.5 rounded-lg transition-colors ${mobilePanel === 'files' ? 'bg-amber-600 text-white' : 'hover:bg-white/5'}`}
                style={mobilePanel !== 'files' ? { color: '#9c8888' } : undefined}
                title="Attached files"><FileText className="w-5 h-5" /></button>
              <button onClick={() => setMobilePanel(mobilePanel === 'toml' ? 'none' : 'toml')}
                className={`p-2.5 rounded-lg transition-colors ${mobilePanel === 'toml' ? 'bg-amber-600 text-white' : 'hover:bg-white/5'}`}
                style={mobilePanel !== 'toml' ? { color: '#9c8888' } : undefined}
                title="Profile preview"><Eye className="w-5 h-5" /></button>
            </div>
          </header>

          {mobilePanel !== 'none' && (
            <div className="max-h-[45vh] overflow-y-auto" style={{ borderBottom: `1px solid ${BORDER_COLOR}`, backgroundColor: '#120c0c' }}>
              {mobilePanel === 'files' ? (
                <HaephestosLeftPanel files={files} onRemoveFile={handleRemoveFile} onFileUpload={handleSlotUpload}
                  onInjectFiles={handleInjectFiles} onClose={() => setMobilePanel('none')}
                  playingAnimation={playingAnimation} animationVideoRef={animationVideoRef}
                  videoMuted={videoMuted} onToggleMute={() => {
                    const video = animationVideoRef.current
                    if (!video) return
                    if (videoMuted) { video.muted = false; if (!video.paused) { localStorage.setItem('haephestos-audio-unlocked', '1'); setVideoMuted(false) } }
                    else { video.muted = true; setVideoMuted(true) }
                  }} />
              ) : (
                <TomlPreviewPanel tomlPath={tomlPath} onClose={() => setMobilePanel('none')} />
              )}
            </div>
          )}

          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <TerminalView session={session} isVisible={true} hideUploadButton={true} autoClearOnConnect={true} onFileUploaded={handleFileUploaded} />
          </main>
        </div>
      </TerminalProvider>
    )
  }

  // Desktop layout — same 3-column layout as agent-creation page
  return (
    <TerminalProvider>
      <div className="flex flex-col h-full" style={{ backgroundColor: PAGE_BG }}>
        {/* Two-frame content area */}
        <div className="flex-1 flex gap-3 mx-3 mt-2 mb-2 min-h-0 overflow-hidden">

          {/* LEFT: AMBER frame — Agent Profile (TOML preview) */}
          {rightPanelOpen && (
            <div className="flex flex-col" style={{ width: '30%', minWidth: 180, maxWidth: '30%' }}>
              <div className="flex items-end">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                  style={{ backgroundColor: TAB_AMBER_BG, color: TAB_AMBER_TEXT, border: `1px solid ${TAB_AMBER_BORDER}`, borderBottom: 'none', marginBottom: -1, zIndex: 2 }}>
                  <ScrollText className="w-4 h-4" style={{ color: TAB_AMBER_TEXT }} />
                  <span>Agent Profile</span>
                  <span className="font-medium text-[10px] tracking-normal" style={{ color: '#8a7030' }}>*.agent.toml</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-lg rounded-tr-lg"
                style={{ border: `${FRAME_W}px solid ${FRAME_AMB_BASE}`, borderImageSlice: 1, borderImageSource: FRAME_AMB_GRAD, boxShadow: `0 0 20px ${FRAME_AMB_GLOW}, ${FRAME_AMB_INSET}`, backgroundColor: '#0e0a0a' }}>
                <TomlPreviewPanel tomlPath={tomlPath} onClose={() => setRightPanelOpen(false)} />
              </div>
            </div>
          )}

          {/* CENTER+RIGHT: terminal (red) + avatar (red) + raw materials (steel) */}
          <div className="flex-1 flex min-w-0 gap-0">
            {/* Terminal column */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-end">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                  style={{ backgroundColor: TAB_GOLD_BG, color: TAB_GOLD_TEXT, border: `1px solid ${TAB_GOLD_BORDER}`, borderBottom: 'none', marginBottom: -1, zIndex: 2 }}>
                  <Hammer className="w-4 h-4" style={{ color: TAB_GOLD_TEXT }} />
                  <span>Haephestos</span>
                  <span className="font-medium text-[10px] tracking-normal" style={{ color: '#8a7040' }}>Agent Creator</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-bl-lg" style={{ border: `${FRAME_W}px solid ${FRAME_RED_BASE}` }}>
                <div className="h-full flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ backgroundColor: '#0a0808' }}>
                  <TerminalView session={session} isVisible={true} hideUploadButton={true} autoClearOnConnect={true} onFileUploaded={handleFileUploaded} />
                </div>
              </div>
            </div>

            {/* Avatar + Raw Materials column */}
            <aside className="shrink-0 flex flex-col overflow-hidden" style={{ width: '43%', minWidth: 180, maxWidth: '43%', backgroundColor: PAGE_BG }}>
              {/* Spacer for tab alignment */}
              <div className="flex items-end"><div className="px-4 py-1.5 text-xs" style={{ marginBottom: -1, visibility: 'hidden' }}>&nbsp;</div></div>

              {/* Haephestos avatar (red frame) */}
              <div className="shrink-0 relative" style={{ border: `${FRAME_W}px solid ${FRAME_RED_BASE}`, marginLeft: -FRAME_W, zIndex: 3 }}>
                {playingAnimation ? (
                  <div className="relative">
                    <video ref={animationVideoRef} src="/avatars/haephestos-animation.mp4" playsInline muted className="w-full h-auto" style={{ display: 'block' }} />
                    <button className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 transition-colors"
                      title={videoMuted ? 'Enable sound' : 'Mute'} onClick={() => {
                        const video = animationVideoRef.current; if (!video) return
                        if (videoMuted) { video.muted = false; if (!video.paused) { localStorage.setItem('haephestos-audio-unlocked', '1'); setVideoMuted(false) } }
                        else { video.muted = true; setVideoMuted(true) }
                      }}>
                      {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src="/avatars/haephestos.jpg?v=20260318" alt="Haephestos" className="w-full h-auto" style={{ display: 'block' }} />
                )}
              </div>

              <div style={{ height: 10 }} />

              {/* Raw Materials — steel-framed */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-end">
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-extrabold uppercase tracking-widest"
                    style={{ backgroundColor: TAB_STEEL_BG, color: TAB_STEEL_TEXT, border: `1px solid ${TAB_STEEL_BORDER}`, borderBottom: 'none', marginBottom: -1, zIndex: 2 }}>
                    <span className="text-sm" style={{ color: '#c0a860' }}>&#9791;</span>
                    <span>Raw Materials</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-b-lg rounded-tr-lg"
                  style={{ border: `${FRAME_W}px solid ${FRAME_STEEL_BASE}`, borderImageSlice: 1, borderImageSource: FRAME_STEEL_GRAD, boxShadow: `0 0 18px ${FRAME_STEEL_GLOW}, ${FRAME_STEEL_INSET}`, backgroundColor: RAW_MAT_BG }}>

                  {/* Persona image field */}
                  <div className="shrink-0 space-y-1.5 px-3 pt-3 pb-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#5c6878' }}>Persona Image</span>
                    <div className="flex flex-col items-center">
                      <button onClick={() => setShowAvatarPicker(!showAvatarPicker)} className="overflow-hidden transition-all hover:ring-2 hover:ring-amber-500/40" title="Click to change avatar" style={{ padding: 8, maxWidth: 196 }}>
                        <div style={{ border: '1px solid rgba(255,255,255,0.25)', lineHeight: 0, padding: 4, aspectRatio: '1 / 1', overflow: 'hidden' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={avatarUrl} alt="Agent avatar" className="block" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      </button>
                      <span className="text-[10px] py-1" style={{ color: '#506070' }}>Click image to change</span>
                    </div>
                    {showAvatarPicker && (
                      <div className="grid grid-cols-5 gap-1 p-2 rounded-lg max-h-[160px] overflow-y-auto custom-scrollbar" style={{ backgroundColor: '#080a10', border: `1px solid ${TAB_STEEL_BORDER}` }}>
                        {Array.from({ length: 55 }, (_, i) => (
                          <button key={i} onClick={() => { setAvatarIndex(i); setShowAvatarPicker(false) }}
                            className={`rounded overflow-hidden border-2 transition-all ${i === avatarIndex ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-transparent hover:border-gray-600'}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/avatars/robots_${i.toString().padStart(2, '0')}.jpg`} alt={`Avatar ${i}`} className="w-full h-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* File upload slots */}
                  <HaephestosLeftPanel files={files} onRemoveFile={handleRemoveFile} onFileUpload={handleSlotUpload}
                    onInjectFiles={handleInjectFiles} playingAnimation={playingAnimation}
                    animationVideoRef={animationVideoRef} videoMuted={videoMuted}
                    onToggleMute={() => {
                      const video = animationVideoRef.current; if (!video) return
                      if (videoMuted) { video.muted = false; if (!video.paused) { localStorage.setItem('haephestos-audio-unlocked', '1'); setVideoMuted(false) } }
                      else { video.muted = true; setVideoMuted(true) }
                    }}
                    hideHeader={true}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </TerminalProvider>
  )
}
