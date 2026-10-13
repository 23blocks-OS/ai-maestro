'use client'

/**
 * The launch choice, as one panel used by the wake dialog and the create wizard (F040): which tool, how much it
 * asks first (Careful / Balanced / Hands-off + Read-only), and the tool's own options. Presentational: all state
 * lives in useLaunchChoice, so both screens behave and read the same.
 */
import { Terminal, Cpu, Code2, Sparkles, ChevronRight } from 'lucide-react'
import TrustLevelSelector from '../TrustLevelSelector'
import { PROGRAM_CHOICES, noPermissionChoiceNote, permissionModesFor, type ProgramChoice } from '@/lib/program-choices'
import { MODE_SUMMARY, STOP_LABEL, STOP_HELP, stopsFor, canReadOnly, type FreedomStop } from '@/lib/freedom'
import { launchOptionsFor } from '@/lib/launch-options'
import type { LaunchChoice } from '@/hooks/useLaunchChoice'
import { useToolReadiness } from '@/hooks/useToolReadiness'

const ICONS: Record<string, typeof Code2> = { claude: Sparkles, terminal: Terminal, current: Cpu }

export default function LaunchChoicePanel({
  c,
  displayName,
  disabled = false,
  withExecMode = false,
  compact = false,
  hostUrl,
  onlyTools,
  hideFreedom = false,
  note,
}: {
  c: LaunchChoice
  displayName: string
  disabled?: boolean
  /** Claude Code only: offer Terminal / Streaming under "More options" (the wake dialog does; creating does not). */
  withExecMode?: boolean
  /** For a narrow column (the create wizard): no side padding, smaller text, tile names may wrap. */
  compact?: boolean
  /** The host the agent will run on (a configured host's URL); empty means this one. Used for the readiness check. */
  hostUrl?: string
  /**
   * Offer only these tools (a container image has three), with no "More tools", no readiness check (the image
   * carries them) and no tool options: the container builds its own command.
   */
  onlyTools?: readonly string[]
  /** Leave out the "how much should it ask first" choice (AWS agents start the bare tool). */
  hideFreedom?: boolean
  /** A line under the tool description, for what is special about where it runs. */
  note?: string
}) {
  const { tool: realReadinessOf } = useToolReadiness(hostUrl)
  const readinessOf: typeof realReadinessOf = onlyTools ? () => undefined : realReadinessOf
  const pad = compact ? 'px-0' : 'px-6'
  const isWaking = disabled
  const {
    selected, selectedId, currentOption, modes, noChoiceNote, stops, currentStop, readOnly, missingStops, decls, clean, setCount,
    permissionMode, options, execMode, showMore, showAdvanced, showExact,
    setShowMore, setShowAdvanced, setShowExact, setExecMode, setPermissionMode,
    chooseStop, toggleReadOnly, setOption, handleProgramChange,
  } = c
  const hasAdvanced = !onlyTools && (decls.length > 0 || (withExecMode && selected.kind === 'claude'))

  // A compact tile: two per row, so the permission choice below stays on screen without scrolling.
  const renderChoice = (option: ProgramChoice) => {
    const Icon = ICONS[option.id] || Code2
    const isSelected = selectedId === option.id
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => handleProgramChange(option)}
        disabled={isWaking}
        title={option.description}
        aria-pressed={isSelected}
        className={`flex items-center gap-2 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'} rounded-lg border text-left transition-all min-w-0 ${
          isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
        {readinessOf(option.id) && (
          <span
            aria-hidden
            data-testid={`tool-dot-${option.id}`}
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 order-last ml-auto ${
              readinessOf(option.id)!.state === 'ready' ? 'bg-emerald-500' : readinessOf(option.id)!.state === 'missing' ? 'bg-amber-500' : 'bg-red-500'
            }`}
          />
        )}
        <span className={`${compact ? 'text-xs leading-tight' : 'text-sm truncate'} font-medium ${isSelected ? 'text-emerald-400' : 'text-zinc-200'}`}>{option.name}</span>
      </button>
    )
  }

  const main = PROGRAM_CHOICES.filter((x) => x.group === 'main')
  const more = PROGRAM_CHOICES.filter((x) => x.group === 'more')
  const shell = PROGRAM_CHOICES.filter((x) => x.group === 'shell')

  return (
    <>
      {/* Tool */}
      <div className={`${pad} ${compact ? 'pt-0' : 'pt-4'} pb-3`}>
        <p className="text-sm text-zinc-300 mb-2">What should {displayName} run?</p>
        <div className="grid grid-cols-2 gap-2">
          {onlyTools ? PROGRAM_CHOICES.filter((x) => onlyTools.includes(x.id)).map(renderChoice) : (
            <>
              {currentOption && renderChoice(currentOption)}
              {main.map(renderChoice)}
              {shell.map(renderChoice)}
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500" data-testid="wake-tool-description">{selected.description}</p>
        {note && <p className="mt-1 text-[11px] text-zinc-500" data-testid="tool-note">{note}</p>}
                {(() => {
                  const r = selectedId === 'current' ? undefined : readinessOf(selectedId)
                  if (!r) return null
                  const text = r.state === 'ready'
                    ? `Installed${r.version ? ` · v${r.version}` : ''}`
                    : r.state === 'missing'
                      ? `Not installed on this host.${r.install ? ` To install: ${r.install}` : ''}`
                      : `Found, but it will not start: ${r.problem || 'it did not run.'}`
                  const tone = r.state === 'ready' ? 'text-zinc-500' : r.state === 'missing' ? 'text-amber-300' : 'text-red-300'
                  return <p className={`mt-1 text-[11px] break-words ${tone}`} data-testid="tool-readiness" data-state={r.state}>{text}</p>
                })()}
        {!onlyTools && (
          <>
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${showMore ? 'rotate-90' : ''}`} />
              More tools (terminal only)
            </button>
            {showMore && <div className="mt-2 grid grid-cols-2 gap-2">{more.map(renderChoice)}</div>}
          </>
        )}
      </div>

      {/* Permissions: shown up front, and only for tools that have them */}
      {modes.length > 0 && !hideFreedom && (
        <div className={`${pad} pb-3`} data-testid="wake-permissions">
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
                  className={`px-2 py-2 rounded-lg border ${compact ? 'text-xs' : 'text-sm'} font-medium transition-all disabled:opacity-40 ${
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
      {modes.length === 0 && noChoiceNote && !hideFreedom && (
        <p className={`${pad} pb-3 text-[11px] text-zinc-500`} data-testid="wake-no-permissions">{noChoiceNote}</p>
      )}

      {/* More options: the tool's own declared choices (generated), then Claude's execution mode. Collapsed unless
          something is already set, so nothing hidden changes how the agent starts. */}
      {hasAdvanced && (
        <div className={`${pad} pb-3`} data-testid="wake-options">
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
              {withExecMode && selected.kind === 'claude' && (
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
    </>
  )
}
