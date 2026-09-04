/**
 * Did the agent's program actually start?
 *
 * We launch a program by typing its name into a tmux pane and pressing Enter.
 * That reports success as long as tmux accepted the keystrokes — which it does
 * even when the shell then answers `claude: command not found`. So an agent
 * whose program is missing, unauthenticated, or not on PATH comes up looking
 * perfectly healthy with a bare shell behind it.
 *
 * Reported on a fresh install (#426): the operator's prose was executed by bash,
 * and they reasonably asked whether they had broken their own installation. They
 * had not. tmux starts a NON-LOGIN shell, so a PATH exported from
 * ~/.bash_profile is simply absent — the default outcome of an npm-installed CLI
 * on Ubuntu.
 *
 * WHY THIS IS MEASURED AND NOT PREDICTED
 *
 * The obvious approach is a preflight `command -v claude` before launching. It
 * does not work, because we cannot reproduce the pane's environment from here:
 * a tmux pane runs an interactive non-login shell (which reads ~/.bashrc but not
 * ~/.bash_profile), while a check spawned from the server is non-interactive
 * (which reads neither). A preflight would confidently disagree with the pane it
 * is trying to describe.
 *
 * So we look at what actually happened. After the grace period the pane either
 * holds the program or it holds a shell, and tmux will tell us which — the same
 * `pane_current_command` signal used to stop prose being typed into a shell.
 * When it is still a shell we scrape the pane for the shell's own diagnosis,
 * because the shell has already said precisely what went wrong and repeating it
 * beats inventing our own guess.
 */

import { isShellCommand } from '@/lib/pane-occupant'

/** How long to let a program get itself on screen before judging it. */
export const LAUNCH_GRACE_MS = 4000
export const LAUNCH_POLL_MS = 400

/**
 * How a shell says it could not run the thing.
 *
 * Covers bash/zsh (`command not found`), sh/dash (`: not found`), a bad
 * interpreter or missing wrapper path (`No such file or directory`), and a
 * present-but-not-executable file (`Permission denied`).
 */
const SHELL_FAILURE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /command not found|:\s*not found/i,
    hint:
      'the program is not on PATH inside the tmux session. tmux starts a non-login shell, so a PATH ' +
      'exported from ~/.bash_profile or ~/.profile is not present — move it to ~/.bashrc (or ~/.zshrc), ' +
      'or check the program is installed at all.',
  },
  {
    re: /no such file or directory/i,
    hint: 'the path does not exist, or a wrapper script points at a missing interpreter.',
  },
  {
    re: /permission denied/i,
    hint: 'the file exists but is not executable — check its mode bits.',
  },
]

export interface LaunchVerdict {
  /** The program is running in the pane. */
  started: boolean
  /** Set when we can see it did NOT start. */
  error?: string
  /** What the pane is running instead, when known. */
  occupant?: string
  /** The shell's own error line, verbatim, when we found one. */
  shellSaid?: string
}

/**
 * Find the shell's complaint about this command in the captured pane.
 *
 * Scans the tail only: the launch is the most recent thing that happened, and
 * an old `command not found` from earlier in the session must not be reported
 * as this launch's failure.
 */
export function findLaunchError(pane: string, startCommand: string): { line: string; hint: string } | null {
  if (!pane) return null
  const program = startCommand.trim().split(/\s+/)[0]
  const base = program.split('/').pop() || program
  const lines = pane.split('\n').slice(-25)

  for (const line of lines) {
    for (const { re, hint } of SHELL_FAILURE_PATTERNS) {
      if (!re.test(line)) continue
      // Require the program's own name on the line. Shells prefix their
      // complaint with the offending word, and without this check any unrelated
      // "not found" already on screen would be blamed on the launch.
      if (line.includes(base) || line.includes(program)) {
        return { line: line.trim(), hint }
      }
    }
  }
  return null
}

interface VerifyRuntime {
  capturePane(name: string, lines?: number): Promise<string>
  describePane?(name: string): Promise<Record<string, string>>
}

/**
 * Watch a pane until the program appears, or until we can say it did not.
 *
 * Returns `started: true` on any doubt. A false "did not start" would tell an
 * operator their working agent is broken, which is worse than staying quiet —
 * so a runtime that cannot introspect its pane, or an occupant we do not
 * recognise, counts as started.
 */
export async function verifyProgramStarted(
  runtime: VerifyRuntime,
  sessionName: string,
  startCommand: string,
  opts: { graceMs?: number; pollMs?: number } = {}
): Promise<LaunchVerdict> {
  const graceMs = opts.graceMs ?? LAUNCH_GRACE_MS
  const pollMs = opts.pollMs ?? LAUNCH_POLL_MS
  const target = `${sessionName}:0.0`

  if (!runtime.describePane) return { started: true }

  const deadline = Date.now() + graceMs
  let occupant: string | undefined

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollMs))

    const info = await runtime.describePane(target).catch(() => ({}) as Record<string, string>)
    occupant = info?.command
    if (!occupant) continue

    // The program took the pane. Done — no need to wait out the grace period.
    if (!isShellCommand(occupant)) return { started: true, occupant }

    // Still a shell. It may simply not have launched yet, so only conclude
    // failure once the shell has actually complained.
    const pane = await runtime.capturePane(target, 60).catch(() => '')
    const failure = findLaunchError(pane, startCommand)
    if (failure) {
      return {
        started: false,
        occupant,
        shellSaid: failure.line,
        error: `"${startCommand.trim().split(/\s+/)[0]}" did not start: ${failure.hint}`,
      }
    }
  }

  // Grace expired with a shell still in the pane and no explanation on screen.
  if (occupant && isShellCommand(occupant)) {
    return {
      started: false,
      occupant,
      error:
        `"${startCommand.trim().split(/\s+/)[0]}" did not start — the session is still at a ${occupant} ` +
        `prompt after ${Math.round(graceMs / 1000)}s. Open the Terminal tab and run it by hand to see why.`,
    }
  }

  return { started: true, occupant }
}
