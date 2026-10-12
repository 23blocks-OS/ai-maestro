'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Terminal, Cpu, Code2, Sparkles, Play, ChevronRight } from 'lucide-react'
import TrustLevelSelector from './TrustLevelSelector'
import type { AgentPermissionMode } from '@/types/agent'
import {
  PROGRAM_CHOICES,
  initialWakeSelection,
  permissionModesFor,
  noPermissionChoiceNote,
  type ProgramChoice,
} from '@/lib/program-choices'
import type { WakeChoiceOptions } from '@/lib/wake-request'

interface WakeAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  /**
   * `program` is the tool to start, or '' to keep the agent's own program untouched (a wrapper script,
   * or a tool this dialog no longer offers). `options` always carries the permission mode that was
   * chosen, including "supervised": the server falls back to the stored mode when none is sent.
   */
  onConfirm: (program: string, options?: WakeChoiceOptions & { permissionMode?: AgentPermissionMode }) => void
  agentName: string
  agentAlias?: string
  defaultPermissionMode?: AgentPermissionMode
  /** The agent's own program. The dialog starts on it (it used to always start on Claude Code). */
  defaultProgram?: string
}

const ICONS: Record<string, typeof Code2> = { claude: Sparkles, terminal: Terminal, current: Cpu }

const MODE_SUMMARY: Record<AgentPermissionMode, string> = {
  supervised: 'asks before every change',
  planOnly: 'read-only',
  trustEdits: 'edits freely, asks before commands',
  smartAuto: 'asks only for risky actions',
  fullAutonomy: 'asks for nothing',
}

export default function WakeAgentDialog({
  isOpen,
  onClose,
  onConfirm,
  agentName,
  agentAlias,
  defaultPermissionMode,
  defaultProgram,
}: WakeAgentDialogProps) {
  const start = initialWakeSelection(defaultProgram, defaultPermissionMode)
  const [selectedId, setSelectedId] = useState<string>(start.choiceId)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(start.mode)
  const [execMode, setExecMode] = useState<'terminal' | 'streaming'>('terminal')
  const [remember, setRemember] = useState(true)
  const [showMore, setShowMore] = useState(false)
  const [isWaking, setIsWaking] = useState(false)
  const [mounted, setMounted] = useState(false)

  const displayName = agentAlias || agentName

  useEffect(() => {
    setMounted(true)
  }, [])

  // Start from the agent's own settings every time the dialog opens, and when a different agent is shown.
  useEffect(() => {
    const s = initialWakeSelection(defaultProgram, defaultPermissionMode)
    setSelectedId(s.choiceId)
    setPermissionMode(s.mode)
    setExecMode('terminal')
    setRemember(true)
    setShowMore(PROGRAM_CHOICES.find((c) => c.id === s.choiceId)?.group === 'more')
    setIsWaking(false)
  }, [isOpen, defaultProgram, defaultPermissionMode])

  const currentOption: ProgramChoice | null =
    selectedId === 'current' && defaultProgram
      ? { id: 'current', name: `Keep ${defaultProgram}`, description: 'The program this agent already runs', command: defaultProgram, kind: null, group: 'main' }
      : null
  const selected = currentOption || PROGRAM_CHOICES.find((c) => c.id === selectedId) || PROGRAM_CHOICES[0]
  const modes = permissionModesFor(selected.kind)
  const noChoiceNote = noPermissionChoiceNote(selected.kind)

  const handleProgramChange = (choice: ProgramChoice) => {
    setSelectedId(choice.id)
    const allowed = permissionModesFor(choice.kind)
    // A mode the new tool cannot honour falls back to the safe default instead of silently staying selected.
    setPermissionMode((prev) => (allowed.includes(prev) ? prev : 'supervised'))
  }

  const handleConfirm = () => {
    setIsWaking(true)
    onConfirm(selectedId === 'current' ? '' : selected.id, {
      permissionMode: modes.length > 0 ? permissionMode : undefined,
      execMode: selected.kind === 'claude' ? execMode : undefined,
      remember,
    })
    // The dialog is closed by the parent once the wake finishes.
  }

  if (!mounted) return null

  const renderChoice = (option: ProgramChoice) => {
    const Icon = ICONS[option.id] || Code2
    const isSelected = selectedId === option.id
    return (
      <button
        key={option.id}
        onClick={() => handleProgramChange(option)}
        disabled={isWaking}
        className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all ${
          isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-500/20' : 'bg-zinc-700'}`}>
          <Icon className={`w-5 h-5 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1 text-left">
          <div className={`font-medium ${isSelected ? 'text-emerald-400' : 'text-zinc-200'}`}>{option.name}</div>
          <div className="text-xs text-zinc-500">{option.description}</div>
        </div>
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'}`}>
          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </button>
    )
  }

  const main = PROGRAM_CHOICES.filter((c) => c.group === 'main')
  const more = PROGRAM_CHOICES.filter((c) => c.group === 'more')
  const shell = PROGRAM_CHOICES.filter((c) => c.group === 'shell')

  const dialogContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden w-full max-w-md max-h-[92vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid="wake-dialog"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Play className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Wake Agent</h2>
                    <p className="text-sm text-zinc-400">{displayName}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                {/* Tool */}
                <div className="px-6 py-4">
                  <p className="text-sm text-zinc-300 mb-3">What should {displayName} run?</p>
                  <div className="space-y-2">
                    {currentOption && renderChoice(currentOption)}
                    {main.map(renderChoice)}
                    <button
                      type="button"
                      onClick={() => setShowMore(!showMore)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${showMore ? 'rotate-90' : ''}`} />
                      More tools (terminal only)
                    </button>
                    {showMore && more.map(renderChoice)}
                    {shell.map(renderChoice)}
                  </div>
                </div>

                {/* Permissions: shown up front, and only for tools that have them */}
                {modes.length > 0 && (
                  <div className="px-6 pb-3" data-testid="wake-permissions">
                    <p className="text-xs text-zinc-500 mb-2">How much should it ask first?</p>
                    <TrustLevelSelector value={permissionMode} onChange={setPermissionMode} compact allowed={modes} />
                    {permissionMode === 'fullAutonomy' && (
                      <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                        Nothing will ask before it acts. It can edit any file and run any command as you. Use it for a throwaway folder or a container.
                      </p>
                    )}
                  </div>
                )}
                {modes.length === 0 && noChoiceNote && (
                  <p className="px-6 pb-3 text-[11px] text-zinc-500" data-testid="wake-no-permissions">{noChoiceNote}</p>
                )}

                {/* Execution mode: Claude Code only */}
                {selected.kind === 'claude' && (
                  <div className="px-6 pb-3">
                    <p className="text-xs text-zinc-500 mb-2">Execution mode</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExecMode('terminal')}
                        disabled={isWaking}
                        className={`p-2.5 rounded-lg border text-left transition-all ${execMode === 'terminal' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'}`}
                      >
                        <div className={`text-sm font-medium ${execMode === 'terminal' ? 'text-emerald-400' : 'text-zinc-200'}`}>Terminal</div>
                        <div className="text-[11px] text-zinc-500">tmux TUI · full terminal</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExecMode('streaming')}
                        disabled={isWaking}
                        className={`p-2.5 rounded-lg border text-left transition-all ${execMode === 'streaming' ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'}`}
                      >
                        <div className={`text-sm font-medium ${execMode === 'streaming' ? 'text-amber-400' : 'text-zinc-200'}`}>Streaming</div>
                        <div className="text-[11px] text-zinc-500">clean chat · no terminal</div>
                      </button>
                    </div>
                    {execMode === 'streaming' && (
                      <p className="text-[11px] text-amber-400/70 mt-2">Continues the agent’s latest conversation. No terminal view. Needs a headless token.</p>
                    )}
                  </div>
                )}

                {/* Remember */}
                {selectedId !== 'current' && (
                  <label className="px-6 pb-3 flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-zinc-600" />
                    Remember this for {displayName}
                  </label>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
                <p className="text-[11px] text-zinc-500 mb-3" data-testid="wake-summary">
                  {displayName} will start {selected.name}
                  {modes.length > 0 ? `, ${MODE_SUMMARY[permissionMode]}` : ''}.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isWaking}
                    className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isWaking ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Waking...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Wake Agent
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(dialogContent, document.body)
}
