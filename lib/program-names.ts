/**
 * What a program NAME means, with no file system or server code, so the wake dialog (browser) and the
 * launcher (server) agree. Paths to wrapper scripts are handled in program-command.ts, which needs the
 * file system to check them.
 */

export type ProgramKind = 'claude' | 'codex' | 'aider' | 'cursor' | 'gemini' | 'opencode' | 'openclaw' | 'grok' | 'pi' | 'copilot' | 'wrapper'

const PI_NAMES = new Set(['pi', 'pi-agent', 'pi-coding-agent'])
const COPILOT_NAMES = new Set(['copilot', 'copilot-cli', 'github-copilot', 'github-copilot-cli'])

/** True for the values that mean "give me a shell, launch nothing". */
export function isNoProgramName(program: string | undefined | null): boolean {
  const lower = (program || '').trim().toLowerCase()
  return lower === 'none' || lower === 'terminal'
}

/** A wrapper is anything that looks like a path rather than a bare name. */
export function looksLikeProgramPath(program: string): boolean {
  return program.startsWith('/') || program.startsWith('~/') || program.startsWith('./')
}

/**
 * Match a bare program name (never a path). Substring matching for the long-standing names, whole-name
 * matching for Pi and Copilot CLI: "pi" and "copilot" sit inside far too many other words, and the
 * older `gh copilot` extension (which only suggests and explains commands) must not match.
 */
export function matchProgramName(program: string): { command: string; kind: ProgramKind } | null {
  const lower = (program || '').trim().toLowerCase()
  if (!lower) return null
  if (lower.includes('claude')) return { command: 'claude', kind: 'claude' }
  if (lower.includes('codex')) return { command: 'codex', kind: 'codex' }
  // Deprecated 2026-10 (F031): no longer offered in the UI or docs; kept so existing Aider agents still launch.
  if (lower.includes('aider')) return { command: 'aider', kind: 'aider' }
  if (lower.includes('cursor')) return { command: 'cursor', kind: 'cursor' }
  if (lower.includes('gemini')) return { command: 'gemini', kind: 'gemini' }
  if (lower.includes('opencode')) return { command: 'opencode', kind: 'opencode' }
  if (lower.includes('openclaw')) return { command: 'openclaw', kind: 'openclaw' }
  if (lower.includes('grok')) return { command: 'grok', kind: 'grok' }
  const whole = lower.replace(/\s+/g, '-')
  if (PI_NAMES.has(whole)) return { command: 'pi', kind: 'pi' }
  if (COPILOT_NAMES.has(whole)) return { command: 'copilot', kind: 'copilot' }
  return null
}

/**
 * The name stored on an agent when a launch choice is remembered. Claude Code keeps its long-standing
 * "claude-code" (most registries hold that); every other tool is stored under its command.
 */
export function storedProgramName(kind: ProgramKind, command: string): string {
  return kind === 'claude' ? 'claude-code' : command
}
