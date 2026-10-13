/**
 * Is each tool ready to start on a host? (F040 step 4) The rules, with no file system or process code, so the
 * server that checks and the screen that shows the result agree.
 *
 * What is checked: the tool is on the PATH an agent's shell has, it runs (`--version`), and for Pi the Node it
 * would use is new enough. What is NOT checked: whether the person is signed in. Every tool asks for that itself,
 * and AI Maestro shows what a tool asks as a card in the chat.
 */

export type ToolState = 'ready' | 'missing' | 'broken'

export interface ToolReadiness {
  /** The wake dialog's tool id (lib/program-choices). */
  id: string
  command: string
  state: ToolState
  /** Where it was found. */
  path?: string
  version?: string
  /** Why a found tool is not usable, in one line. */
  problem?: string
  /** How to install it, when we know a command that works. */
  install?: string
}

export interface ReadinessReport {
  checkedAt: string
  /** The Node an agent's shell would use, e.g. "v22.23.3", when there is one. */
  node?: string
  tools: ToolReadiness[]
}

/** The tools worth checking. `install` is only given where the command was verified; never guessed. */
export const READINESS_TOOLS: Array<{ id: string; command: string; install?: string; needsZstdNode?: boolean }> = [
  { id: 'claude', command: 'claude', install: 'npm install -g @anthropic-ai/claude-code' },
  { id: 'codex', command: 'codex', install: 'npm install -g @openai/codex' },
  { id: 'grok', command: 'grok' },
  { id: 'copilot', command: 'copilot', install: 'npm install -g @github/copilot' },
  { id: 'pi', command: 'pi', install: 'npm install -g @earendil-works/pi-coding-agent', needsZstdNode: true },
  { id: 'gemini', command: 'gemini', install: 'npm install -g @google/gemini-cli' },
  { id: 'opencode', command: 'opencode' },
  { id: 'openclaw', command: 'openclaw' },
]

/** First thing that looks like a version in a tool's `--version` output ("1.0.96", "2.1.3 (Claude Code)"). */
export function parseVersion(output: string | undefined | null): string | undefined {
  for (const raw of String(output || '').split('\n')) {
    const m = raw.match(/\bv?(\d+\.\d+(?:\.\d+)?(?:[-+.][0-9A-Za-z.]+)?)/)
    if (m) return m[1]
  }
  return undefined
}

/** One short, printable line from a failed run's output (the first non-empty line, capped). */
export function firstProblemLine(output: string | undefined | null): string {
  const line = String(output || '').split('\n').map((l) => l.trim()).find((l) => l.length > 0) || ''
  // eslint-disable-next-line no-control-regex
  return line.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200)
}

/**
 * Pi needs a Node with zstd support: the 22 line from 22.15, the 23 line from 23.8, and 24 or later.
 * (Found on mac-mini, 2026-10-12: Pi did not start on older Node.)
 */
export function nodeSupportsZstd(version: string | undefined | null): boolean {
  const m = String(version || '').match(/^v?(\d+)\.(\d+)/)
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major >= 24) return true
  if (major === 22) return minor >= 15
  if (major === 23) return minor >= 8
  return false
}

/** Turns what was found into the report row. */
export function judgeTool(input: {
  id: string
  command: string
  install?: string
  needsZstdNode?: boolean
  foundPath?: string
  run?: { ok: boolean; output: string }
  node?: string
}): ToolReadiness {
  const base = { id: input.id, command: input.command, ...(input.install ? { install: input.install } : {}) }
  if (!input.foundPath) return { ...base, state: 'missing' }
  const withPath = { ...base, path: input.foundPath }
  if (input.needsZstdNode && !nodeSupportsZstd(input.node)) {
    return {
      ...withPath,
      state: 'broken',
      problem: `Needs Node 22.15 or newer (or 23.8+, 24+); an agent's shell has ${input.node || 'no Node'}.`,
    }
  }
  if (!input.run || !input.run.ok) {
    return { ...withPath, state: 'broken', problem: firstProblemLine(input.run?.output) || 'It did not run.' }
  }
  const version = parseVersion(input.run.output)
  return { ...withPath, state: 'ready', ...(version ? { version } : {}) }
}
