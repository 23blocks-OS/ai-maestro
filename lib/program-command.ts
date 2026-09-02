/**
 * Resolving an agent's configured `program` to the command that actually runs.
 *
 * Two things were wrong with the ladder this replaces.
 *
 * 1. It was a closed whitelist of names, so `program` could never point at a
 *    wrapper script. An agent that reads untrusted external mail and must run
 *    inside `sandbox-exec` had no way to say so. The workaround in the field was
 *    to wake with `startProgram:false` and launch the wrapped program by hand —
 *    which works right up until the next ordinary wake starts the program
 *    UNSANDBOXED, with nothing to warn anyone. A detector was built because a
 *    preventer could not be.
 *
 * 2. Its fallback was `return 'claude'`. Any value it did not recognise silently
 *    became plain Claude Code. That is the worst possible default for the case
 *    above: the one configuration that must not launch bare is exactly the one
 *    an unrecognised name produced.
 *
 * So: wrappers are first-class, and an unresolvable program is an error that
 * refuses to launch rather than a guess that launches the wrong thing.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export type ProgramKind = 'claude' | 'codex' | 'aider' | 'cursor' | 'gemini' | 'opencode' | 'openclaw' | 'wrapper'

export interface ResolvedProgram {
  /** Shell-ready command to launch, or null if it could not be resolved. */
  command: string | null
  /**
   * What the command behaves like. Drives claude-specific flags
   * (--permission-mode, telemetry env, --channels), which a wrapper around
   * Claude Code still wants.
   */
  kind: ProgramKind | null
  /** Why it could not be resolved. Present iff command is null. */
  error?: string
}

/** Characters that would let a `program` value break out of the launch command. */
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n\r'"\\*?[\]!#~]/

/** A wrapper is anything that looks like a path rather than a bare name. */
function looksLikePath(program: string): boolean {
  return program.startsWith('/') || program.startsWith('~/') || program.startsWith('./')
}

function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

/**
 * Resolve a wrapper path.
 *
 * Deliberately strict: it must be an absolute (or ~-rooted) path to a file that
 * exists and is executable, with no shell metacharacters. `program` is written
 * into a shell command line, so anything looser is a command-injection hole,
 * and a wrapper that is missing or non-executable must fail loudly here rather
 * than at wake time inside a tmux pane nobody is watching.
 */
function resolveWrapper(program: string): ResolvedProgram {
  if (SHELL_METACHARACTERS.test(program)) {
    return { command: null, kind: null, error: `program path contains shell metacharacters: ${program}` }
  }
  if (/\s/.test(program)) {
    return { command: null, kind: null, error: `program path contains whitespace: ${program}` }
  }
  if (program.startsWith('./')) {
    return {
      command: null,
      kind: null,
      error: `program path must be absolute (or ~/-rooted); relative paths depend on the launch cwd: ${program}`,
    }
  }

  const resolved = expandHome(program)
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      return { command: null, kind: null, error: `program path is not a file: ${resolved}` }
    }
    fs.accessSync(resolved, fs.constants.X_OK)
  } catch {
    return { command: null, kind: null, error: `program path is missing or not executable: ${resolved}` }
  }

  // A wrapper around Claude Code still wants Claude's flags. Naming is the
  // signal, matching how the bare names below are matched: call it
  // `claude-sandboxed.sh` and it is treated as claude.
  const base = path.basename(resolved).toLowerCase()
  const kind: ProgramKind = base.includes('claude') ? 'claude' : 'wrapper'
  return { command: resolved, kind }
}

/**
 * Resolve `program` to a launchable command.
 *
 * Returns `{ command: null, error }` for anything unresolvable. Callers must
 * NOT substitute a default — that was the old bug.
 */
export function resolveProgramCommand(program: string): ResolvedProgram {
  const p = (program || '').trim()
  if (!p) return { command: null, kind: null, error: 'no program configured' }

  if (looksLikePath(p)) return resolveWrapper(p)

  const lower = p.toLowerCase()
  if (lower.includes('claude')) return { command: 'claude', kind: 'claude' }
  if (lower.includes('codex')) return { command: 'codex', kind: 'codex' }
  if (lower.includes('aider')) return { command: 'aider', kind: 'aider' }
  if (lower.includes('cursor')) return { command: 'cursor', kind: 'cursor' }
  if (lower.includes('gemini')) return { command: 'gemini', kind: 'gemini' }
  if (lower.includes('opencode')) return { command: 'opencode', kind: 'opencode' }
  if (lower.includes('openclaw')) return { command: 'openclaw', kind: 'openclaw' }

  return {
    command: null,
    kind: null,
    error:
      `unrecognised program "${p}". Use a known name (claude, codex, aider, cursor, gemini, ` +
      `opencode, openclaw) or an absolute path to an executable wrapper.`,
  }
}

/** True for the two values that mean "give me a shell, launch nothing". */
export function isNoProgram(program: string): boolean {
  const lower = (program || '').trim().toLowerCase()
  return lower === 'none' || lower === 'terminal'
}
