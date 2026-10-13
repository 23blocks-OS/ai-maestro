'use client'

/**
 * The state behind the launch choice panel (F040), shared by the wake dialog and the create wizard: the tool, how
 * freely it may act, and the tool's own options, plus everything derived from them (the modes the tool honours,
 * the stops, the valid options, the exact command). Resets to the agent's own settings when `resetKey` changes.
 */
import { useState, useEffect } from 'react'
import type { AgentPermissionMode } from '@/types/agent'
import { PROGRAM_CHOICES, initialWakeSelection, permissionModesFor, noPermissionChoiceNote, type ProgramChoice } from '@/lib/program-choices'
import { stopsFor, stopForMode, modeForStop, type FreedomStop } from '@/lib/freedom'
import { launchOptionsFor, sanitizeLaunchOptions, previewCommand, type LaunchOptions } from '@/lib/launch-options'

export function useLaunchChoice(input: {
  defaultProgram?: string
  defaultPermissionMode?: AgentPermissionMode | string
  defaultLaunchOptions?: LaunchOptions
  /** Anything that should reset the choice when it changes (a dialog opening, a different agent). */
  resetKey?: unknown
}) {
  const { defaultProgram, defaultPermissionMode, defaultLaunchOptions, resetKey } = input
  const start = initialWakeSelection(defaultProgram, defaultPermissionMode)
  const [selectedId, setSelectedId] = useState<string>(start.choiceId)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(start.mode)
  const [execMode, setExecMode] = useState<'terminal' | 'streaming'>('terminal')
  const [showMore, setShowMore] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showExact, setShowExact] = useState(false)
  const [modeBeforeReadOnly, setModeBeforeReadOnly] = useState<AgentPermissionMode>('supervised')
  const [options, setOptions] = useState<LaunchOptions>({})

  // Start from the agent's own settings whenever the reset key or the agent's saved settings change.
  useEffect(() => {
    const s = initialWakeSelection(defaultProgram, defaultPermissionMode)
    setSelectedId(s.choiceId)
    setPermissionMode(s.mode)
    setExecMode('terminal')
    setShowMore(PROGRAM_CHOICES.find((c) => c.id === s.choiceId)?.group === 'more')
    // Options remembered on the agent are shown open, so nothing hidden changes how it starts.
    const kind = PROGRAM_CHOICES.find((c) => c.id === s.choiceId)?.kind
    const remembered = sanitizeLaunchOptions(kind, defaultLaunchOptions)
    setOptions(remembered)
    setShowAdvanced(Object.keys(remembered).length > 0)
    setShowExact(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, defaultProgram, defaultPermissionMode, JSON.stringify(defaultLaunchOptions || {})])

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

  return {
    selected, selectedId, currentOption, modes, noChoiceNote, stops, currentStop, readOnly, missingStops, decls, clean, setCount, preview,
    permissionMode, options, execMode, showMore, showAdvanced, showExact,
    setShowMore, setShowAdvanced, setShowExact, setExecMode, setPermissionMode,
    chooseStop, toggleReadOnly, setOption, handleProgramChange,
  }
}

export type LaunchChoice = ReturnType<typeof useLaunchChoice>
