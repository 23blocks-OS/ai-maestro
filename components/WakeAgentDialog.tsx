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
import { MODE_SUMMARY, STOP_LABEL, STOP_HELP, stopsFor, canReadOnly, stopForMode, modeForStop, type FreedomStop } from '@/lib/freedom'
import { launchOptionsFor, sanitizeLaunchOptions, previewCommand, type LaunchOptions } from '@/lib/launch-options'

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
  /** The options remembered on the agent (model, effort, continue...). */
  defaultLaunchOptions?: LaunchOptions
}

const ICONS: Record<string, typeof Code2> = { claude: Sparkles, terminal: Terminal, current: Cpu }

export default function WakeAgentDialog({
  isOpen,
  onClose,
  onConfirm,
  agentName,
  agentAlias,
  defaultPermissionMode,
  defaultProgram,
  defaultLaunchOptions,
}: WakeAgentDialogProps) {
  const start = initialWakeSelection(defaultProgram, defaultPermissionMode)
  const [selectedId, setSelectedId] = useState<string>(start.choiceId)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(start.mode)
  const [execMode, setExecMode] = useState<'terminal' | 'streaming'>('terminal')
  const [remember, setRemember] = useState(true)
  const [showMore, setShowMore] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showExact, setShowExact] = useState(false)
  const [modeBeforeReadOnly, setModeBeforeReadOnly] = useState<AgentPermissionMode>('supervised')
  const [options, setOptions] = useState<LaunchOptions>({})
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
    // Options remembered on the agent are shown open, so nothing hidden changes how it starts.
    const kind = PROGRAM_CHOICES.find((c) => c.id === s.choiceId)?.kind
    const remembered = sanitizeLaunchOptions(kind, defaultLaunchOptions)
    setOptions(remembered)
    setShowAdvanced(Object.keys(remembered).length > 0)
    setShowExact(false)
    setIsWaking(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultProgram, defaultPermissionMode, JSON.stringify(defaultLaunchOptions || {})])

  const currentOption: ProgramChoice | null =
    selectedId === 'current' && defaultProgram
      ? { id: 'current', name: 'Keep its own program', description: `Keeps running ${defaultProgram}`, command: defaultProgram, kind: null, group: 'main' }
      : null
  const selected = currentOption || PROGRAM_CHOICES.find((c) => c.id === selectedId) || PROGRAM_CHOICES[0]
  const modes = permissionModesFor(selected.kind)
  const noChoiceNote = noPermissionChoiceNote(selected.kind)
  const stops = stopsFor(selected.kind)
  const { stop: currentStop, readOnly } = stopForMode(permissionMode)
  const chooseStop = (stop: FreedomStop) => setPermissionMode(modeForStop(selected.kind, stop, false, permissionMode))
  const toggleReadOnly = (on: boolean) => {
    if (on) { setModeBeforeReadOnly(permissionMode); setPermissionMode('planOnly') }
    else setPermissionMode(modeBeforeReadOnly === 'planOnly' ? 'supervised' : modeBeforeReadOnly)
  }
  const missingStops = (['careful', 'balanced', 'handsOff'] as FreedomStop[]).filter((st) => !stops.includes(st))
  const decls = launchOptionsFor(selected.kind)
  const clean = sanitizeLaunchOptions(selected.kind, options)
  const setCount = Object.keys(clean).length
  const hasAdvanced = decls.length > 0 || selected.kind === 'claude'
  const preview = selectedId === 'current' || selected.command === 'none'
    ? null
    : previewCommand({ command: selected.command, kind: selected.kind, mode: modes.length > 0 ? permissionMode : undefined, options: clean })
  const setOption = (id: string, value: string | boolean | undefined) =>
    setOptions((prev) => {
      const next = { ...prev }
      if (value === undefined || value === '' || value === false) delete next[id]
      else next[id] = value
      return next
    })

  const handleProgramChange = (choice: ProgramChoice) => {
    setSelectedId(choice.id)
    const allowed = permissionModesFor(choice.kind)
    // A mode the new tool cannot honour falls back to the safe default instead of silently staying selected.
    setPermissionMode((prev) => (allowed.includes(prev) ? prev : 'supervised'))
    // Options belong to a tool: keep only the ones the new tool declares.
    setOptions((prev) => sanitizeLaunchOptions(choice.kind, prev))
  }

  const handleConfirm = () => {
    setIsWaking(true)
    onConfirm(selectedId === 'current' ? '' : selected.id, {
      permissionMode: modes.length > 0 ? permissionMode : undefined,
      execMode: selected.kind === 'claude' ? execMode : undefined,
      launchOptions: decls.length > 0 ? clean : undefined,
      remember,
    })
    // The dialog is closed by the parent once the wake finishes.
  }

  if (!mounted) return null

  // A compact tile: two per row, so the permission choice below stays on screen without scrolling.
  const renderChoice = (option: ProgramChoice) => {
    const Icon = ICONS[option.id] || Code2
    const isSelected = selectedId === option.id
    return (
      <button
        key={option.id}
        onClick={() => handleProgramChange(option)}
        disabled={isWaking}
        title={option.description}
        aria-pressed={isSelected}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all min-w-0 ${
          isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
        <span className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-400' : 'text-zinc-200'}`}>{option.name}</span>
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
                <div className="px-6 pt-4 pb-3">
                  <p className="text-sm text-zinc-300 mb-2">What should {displayName} run?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {currentOption && renderChoice(currentOption)}
                    {main.map(renderChoice)}
                    {shell.map(renderChoice)}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500" data-testid="wake-tool-description">{selected.description}</p>
                  <button
                    type="button"
                    onClick={() => setShowMore(!showMore)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${showMore ? 'rotate-90' : ''}`} />
                    More tools (terminal only)
                  </button>
                  {showMore && <div className="mt-2 grid grid-cols-2 gap-2">{more.map(renderChoice)}</div>}
                </div>

                {/* Permissions: shown up front, and only for tools that have them */}
                {modes.length > 0 && (
                  <div className="px-6 pb-3" data-testid="wake-permissions">
                    <p className="text-xs text-zinc-500 mb-2">How much should it ask first?</p>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }} role="group" aria-label="How much it asks first">
                      {stops.map((st) => {
                        const on = !readOnly && currentStop === st
                        const danger = st === 'handsOff'
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => chooseStop(st)}
                            disabled={isWaking || readOnly}
                            aria-pressed={on}
                            data-testid={`wake-stop-${st}`}
                            className={`px-2 py-2 rounded-lg border text-sm font-medium transition-all disabled:opacity-40 ${
                              on
                                ? danger ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {STOP_LABEL[st]}
                          </button>
                        )
                      })}
                    </div>
                    {canReadOnly(selected.kind) && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                        <input type="checkbox" checked={readOnly} onChange={(e) => toggleReadOnly(e.target.checked)} disabled={isWaking} className="rounded border-zinc-600" data-testid="wake-read-only" />
                        Read-only: it can look around but cannot change anything
                      </label>
                    )}
                    {!readOnly && <p className="mt-2 text-[11px] text-zinc-500" data-testid="wake-stop-help">{STOP_HELP[currentStop]}</p>}
                    {missingStops.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-600" data-testid="wake-missing-stops">
                        {missingStops.map((st) => STOP_LABEL[st]).join(' and ')} {missingStops.length > 1 ? 'are' : 'is'} not available for {selected.name}: it only has {modes.length} permission setting{modes.length > 1 ? 's' : ''}.
                      </p>
                    )}
                    {permissionMode === 'fullAutonomy' && (
                      <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                        Nothing will ask before it acts. It can edit any file and run any command as you. Use it for a throwaway folder or a container.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowExact(!showExact)}
                      className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${showExact ? 'rotate-90' : ''}`} />
                      Exact setting{' '}<span className="text-zinc-600">({MODE_SUMMARY[permissionMode]})</span>
                    </button>
                    {showExact && (
                      <div className="mt-2" data-testid="wake-exact">
                        <TrustLevelSelector value={permissionMode} onChange={setPermissionMode} compact allowed={modes} hideDetail />
                      </div>
                    )}
                  </div>
                )}
                {modes.length === 0 && noChoiceNote && (
                  <p className="px-6 pb-3 text-[11px] text-zinc-500" data-testid="wake-no-permissions">{noChoiceNote}</p>
                )}

                {/* More options: the tool's own declared choices (generated), then Claude's execution mode. Collapsed unless
                    something is already set, so nothing hidden changes how the agent starts. */}
                {hasAdvanced && (
                  <div className="px-6 pb-3" data-testid="wake-options">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                      More options{setCount > 0 ? ` (${setCount} set)` : ''}
                    </button>
                    {showAdvanced && (
                      <div className="mt-2 space-y-2.5">
                        {decls.map((d) => {
                          const raw = options[d.id]
                          const typed = typeof raw === 'string' ? raw : ''
                          const invalid = d.type === 'text' && typed.trim() !== '' && clean[d.id] === undefined
                          return (
                            <div key={d.id}>
                              {d.type === 'toggle' ? (
                                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                                  <input type="checkbox" checked={raw === true} onChange={(e) => setOption(d.id, e.target.checked)} disabled={isWaking} className="rounded border-zinc-600" />
                                  {d.label}
                                </label>
                              ) : (
                                <label className="block">
                                  <span className="block text-xs text-zinc-400 mb-1">{d.label}</span>
                                  {d.type === 'choice' ? (
                                    <select
                                      value={typed}
                                      onChange={(e) => setOption(d.id, e.target.value)}
                                      disabled={isWaking}
                                      className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200"
                                    >
                                      <option value="">default</option>
                                      {d.choices?.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={typed}
                                      onChange={(e) => setOption(d.id, e.target.value)}
                                      disabled={isWaking}
                                      placeholder={d.placeholder}
                                      spellCheck={false}
                                      className={`w-full bg-zinc-800 border rounded-md px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 ${invalid ? 'border-red-500/60' : 'border-zinc-700'}`}
                                    />
                                  )}
                                </label>
                              )}
                              <p className={`mt-1 text-[11px] ${invalid ? 'text-red-300' : 'text-zinc-600'}`}>
                                {invalid ? 'Letters, digits and . _ - / : @ + ~ only, no spaces. This value will not be used.' : d.help}
                              </p>
                            </div>
                          )
                        })}
                        {selected.kind === 'claude' && (
                          <div>
                            <p className="text-xs text-zinc-400 mb-2">Execution mode</p>
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
                      </div>
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
                {preview && (
                  <p className="text-[11px] mb-1.5 text-zinc-500 break-all max-h-16 overflow-y-auto" data-testid="wake-preview">
                    Will run: <code className="text-zinc-300 font-mono">{preview}</code>
                  </p>
                )}
                <p className={`text-[11px] mb-3 ${modes.length > 0 && permissionMode === 'fullAutonomy' ? 'text-red-300' : 'text-zinc-500'}`} data-testid="wake-summary">
                  {selectedId === 'current'
                    ? `${displayName} will keep running ${defaultProgram}.`
                    : `${displayName} will start ${selected.name}${modes.length > 0 ? `, ${MODE_SUMMARY[permissionMode]}` : ''}.`}
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
