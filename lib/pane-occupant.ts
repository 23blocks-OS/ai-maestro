/**
 * What is actually running in an agent's pane.
 *
 * A tmux session existing does NOT mean an agent is running in it. Session
 * status `online` means only that the session exists — so a pane sitting at a
 * bare shell prompt passes every check we had, and anything injected into it is
 * executed as shell commands.
 *
 * That is not hypothetical. Reported on a fresh install (#426): a user created
 * an agent, sent it a sentence of ordinary English, and got
 *
 *     Steve: command not found
 *     Command 'The' not found, did you mean: command 'he' from deb node-he
 *
 * Their prose was run by bash, one line at a time.
 *
 * The check here is deliberately asymmetric. We do NOT try to prove an agent is
 * running — there are too many agent CLIs, and a false negative would refuse to
 * deliver to a working agent. We prove the opposite: that a SHELL is running,
 * which is a short, closed list and the only case that actually causes harm.
 * Unknown occupants are allowed through.
 */

import { getRuntime } from '@/lib/agent-runtime'

/**
 * Shells, as tmux reports them in `pane_current_command`.
 *
 * A login shell can appear with a leading dash. `login` itself shows while a
 * macOS Terminal session is still starting up.
 */
const SHELL_COMMANDS = new Set([
  'bash', 'zsh', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'ash',
  '-bash', '-zsh', '-sh', 'login',
])

export function isShellCommand(command: string | undefined | null): boolean {
  if (!command) return false
  return SHELL_COMMANDS.has(command.trim().toLowerCase())
}

/**
 * True only when we can SEE that the pane is sitting at a shell.
 *
 * Returns false when the runtime cannot introspect the pane, when the command
 * is unrecognised, or on any error — absence of evidence is not evidence here,
 * and refusing to deliver on a hunch would be worse than the bug this prevents.
 */
export async function isPaneAtBareShell(sessionName: string): Promise<boolean> {
  try {
    const runtime = getRuntime()
    if (!runtime.describePane) return false
    const info = await runtime.describePane(`${sessionName}:0.0`)
    return isShellCommand(info?.command)
  } catch {
    return false
  }
}

/**
 * What to tell someone whose agent has no program running.
 *
 * The reporter's question was "Did I do something wrong in the installation?" —
 * so the message names the actual state and the actual next step, rather than
 * failing with something they would have to interpret.
 */
export const BARE_SHELL_MESSAGE =
  'The agent\'s session is sitting at a shell prompt — no agent program is running in it, ' +
  'so this message would be executed as shell commands instead of read. ' +
  'Wake the agent (or start its program in the Terminal tab). ' +
  'If waking does not help, the configured program is probably not installed or not on PATH ' +
  'in that session — check the Terminal tab and try running it by hand.'
