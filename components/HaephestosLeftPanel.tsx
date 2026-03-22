'use client'

import { useRef } from 'react'
import { ArrowLeft, Code, Sparkles, FileText, X, Send, FolderOpen, Volume2, VolumeX } from 'lucide-react'

interface HaephestosLeftPanelProps {
  files: Array<{ path: string; filename: string; slot?: 'codebase' | 'skills' | 'context' }>
  onRemoveFile: (path: string) => void
  onFileUpload: (slot: 'codebase' | 'skills' | 'context', file: File) => void
  onInjectFiles: () => void
  onClose?: () => void
  /** Current panel width in px — controls avatar size and layout density */
  panelWidth?: number
  /** When true, hides the title and avatar image (rendered externally by parent) */
  hideHeader?: boolean
  /** When true, shows celebration animation video instead of static avatar */
  playingAnimation?: boolean
  /** Ref for the animation video element (parent controls playback) */
  animationVideoRef?: React.RefObject<HTMLVideoElement>
  /** Whether the animation video is currently muted */
  videoMuted?: boolean
  /** Toggle mute/unmute on the animation video */
  onToggleMute?: () => void
}

type SlotDef = {
  slot: 'codebase' | 'skills' | 'context'
  label: string
  icon: React.ReactNode
}

const SLOT_DEFS: (SlotDef & { accept: string; hint: string })[] = [
  { slot: 'codebase', label: 'Agent Description', hint: '*.md file', accept: '.md,.txt', icon: <FileText size={14} className="shrink-0 text-cyan-400" /> },
  { slot: 'skills', label: 'Project Design Requirements', hint: '*.md file', accept: '.md,.txt', icon: <Sparkles size={14} className="shrink-0 text-yellow-300" /> },
  { slot: 'context', label: 'Existing Agent Profile', hint: '*.agent.toml file', accept: '.toml,.agent.toml', icon: <Code size={14} className="shrink-0 text-emerald-400" /> },
]

export default function HaephestosLeftPanel({
  files,
  onRemoveFile,
  onFileUpload,
  onInjectFiles,
  onClose,
  panelWidth,
  hideHeader,
  playingAnimation,
  animationVideoRef,
  videoMuted,
  onToggleMute,
}: HaephestosLeftPanelProps) {
  // Hidden file inputs — one per slot
  const codebaseInputRef = useRef<HTMLInputElement>(null)
  const skillsInputRef = useRef<HTMLInputElement>(null)
  const contextInputRef = useRef<HTMLInputElement>(null)

  const inputRefs = {
    codebase: codebaseInputRef,
    skills: skillsInputRef,
    context: contextInputRef,
  } as const

  // Collapsed = icon-only mode when panel is very narrow
  const collapsed = panelWidth !== undefined && panelWidth < 120

  // Find the file assigned to each slot
  const getSlotFile = (slot: 'codebase' | 'skills' | 'context') =>
    files.find((f) => f.slot === slot)

  // Files without a slot go into the generic list
  const genericFiles = files.filter((f) => !f.slot)

  // At least one slot has a file — enables inject button
  const hasAnySlotFile = SLOT_DEFS.some((def) => getSlotFile(def.slot))

  const handleBrowse = (slot: 'codebase' | 'skills' | 'context') => {
    inputRefs[slot].current?.click()
  }

  const handleFileChange = (slot: 'codebase' | 'skills' | 'context', e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      onFileUpload(slot, selected)
    }
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200">
      {/* ---- Mobile back arrow (only when onClose provided) ---- */}
      {onClose && (
        <div className="flex items-center pt-2 pb-1 px-2">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            style={{ minWidth: 40, minHeight: 40 }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        </div>
      )}

      {/* ---- Title + Image block (hidden when parent renders avatar externally) ---- */}
      {!hideHeader && (
        <div className="flex flex-col items-center border-b border-gray-700/50">
          {/* Big centered title above the image */}
          {!collapsed && (
            <div className="w-full flex flex-col items-center py-3">
              <span
                className="font-extrabold text-amber-400 text-center leading-tight"
                style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', width: '70%' }}
              >
                Haephestos
              </span>
              <span
                className="text-gray-400 font-medium text-center mt-0.5"
                style={{ fontSize: 'clamp(0.65rem, 1.5vw, 0.8rem)' }}
              >
                Agent Creator
              </span>
            </div>
          )}

          {/* Image — thick carved tunnel window effect */}
          <div
            className="overflow-hidden w-full relative"
            style={{
              padding: '10px',
              background: 'linear-gradient(145deg, #2a0a0a 0%, #3a1418 40%, #4a1c22 70%, #5a2830 100%)',
              borderTop: '3px solid #451212',
              borderLeft: '3px solid #451212',
              borderRight: '3px solid #7a3030',
              borderBottom: '3px solid #7a3030',
              boxShadow: 'inset 8px 8px 16px rgba(0,0,0,0.7), inset -6px -6px 12px rgba(255,255,255,0.04), inset 0 0 35px rgba(120,15,8,0.6)',
            }}
          >
            <div
              className="overflow-hidden w-full"
              style={{
                boxShadow: 'inset 4px 4px 8px rgba(0,0,0,0.8), inset -3px -3px 6px rgba(140,25,12,0.2)',
                borderTop: '2px solid #380e0e',
                borderLeft: '2px solid #380e0e',
                borderRight: '2px solid #6a2525',
                borderBottom: '2px solid #6a2525',
              }}
            >
              {playingAnimation ? (
                <div className="relative">
                  <video
                    ref={animationVideoRef}
                    src="/avatars/haephestos-animation.mp4"
                    playsInline
                    muted
                    className="w-full h-auto"
                    style={{ display: 'block' }}
                  />
                  {onToggleMute && (
                    <button
                      className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 transition-colors"
                      title={videoMuted ? 'Enable sound' : 'Mute'}
                      onClick={onToggleMute}
                    >
                      {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/avatars/haephestos.jpg?v=20260315"
                    alt="Haephestos"
                    className="w-full h-auto"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- File Upload Section (3 permanent slots) ---- */}
      {!collapsed && (
        <div className="px-3 pt-4 pb-2 space-y-3 border-b border-gray-700/50">
          <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-semibold px-1">Upload Files</h3>

          {SLOT_DEFS.map((def) => {
            const slotFile = getSlotFile(def.slot)
            return (
              <div key={def.slot} className="flex items-center gap-2 px-1">
                {/* Icon */}
                {def.icon}

                {/* Label + filename */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-yellow-300">{def.label}</div>
                  <div className="text-[10px] text-gray-500 italic">{def.hint}</div>
                  {slotFile ? (
                    <div
                      className="text-xs text-gray-200 mt-0.5"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {slotFile.filename}
                    </div>
                  ) : (
                    <div className="text-xs italic text-gray-600 mt-0.5">No file</div>
                  )}
                </div>

                {/* Browse button */}
                <button
                  onClick={() => handleBrowse(def.slot)}
                  className="shrink-0 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-amber-400 hover:text-amber-300 transition-colors"
                  style={{ width: 40, height: 40 }}
                  title="Browse files"
                >
                  <FolderOpen size={20} />
                </button>

                {/* Remove button (only when file exists) */}
                {slotFile && (
                  <button
                    onClick={() => onRemoveFile(slotFile.path)}
                    className="shrink-0 p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                    style={{ minWidth: 40, minHeight: 40 }}
                    aria-label={`Remove ${def.label}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Hidden file inputs */}
          {SLOT_DEFS.map((def) => (
            <input
              key={`input-${def.slot}`}
              ref={inputRefs[def.slot]}
              type="file"
              accept={def.accept}
              className="hidden"
              onChange={(e) => handleFileChange(def.slot, e)}
            />
          ))}

          {/* Inject Files button */}
          <button
            onClick={onInjectFiles}
            disabled={!hasAnySlotFile}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              hasAnySlotFile
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Send size={14} />
            Inject into Chat
          </button>
        </div>
      )}

      {/* ---- Additional Attached Files (generic, no slot) ---- */}
      <div className={`flex-1 overflow-y-auto py-3 custom-scrollbar ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {!collapsed && genericFiles.length > 0 && (
          <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-semibold mb-3 px-1">
            Attached Files
          </h3>
        )}

        {collapsed ? (
          /* Collapsed: show all files as icons */
          files.length > 0 && (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.path}
                  className="flex justify-center p-1.5 rounded hover:bg-gray-800 transition-colors"
                  title={file.filename}
                >
                  <FileText size={16} className="shrink-0 text-gray-500" />
                </li>
              ))}
            </ul>
          )
        ) : (
          /* Expanded: show only generic (non-slot) files */
          genericFiles.length > 0 && (
            <ul className="space-y-1.5">
              {genericFiles.map((file) => (
                <li
                  key={file.path}
                  className="group flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-800 transition-colors"
                  title={file.filename}
                >
                  <FileText size={14} className="shrink-0 text-gray-500" />
                  <span
                    className="text-xs flex-1"
                    style={{ wordBreak: 'break-word' }}
                  >
                    {file.filename}
                  </span>
                  <button
                    onClick={() => onRemoveFile(file.path)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-opacity"
                    style={{ minWidth: 40, minHeight: 40 }}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}
