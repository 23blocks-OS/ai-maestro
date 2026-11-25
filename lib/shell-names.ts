/**
 * Shells, as tmux reports them in `pane_current_command`.
 *
 * A login shell can appear with a leading dash. `login` itself shows while a
 * macOS Terminal session is still starting up.
 *
 * Its own module so the runtime (lib/agent-runtime) can use it without importing
 * lib/pane-occupant, which imports the runtime.
 */
const SHELL_COMMANDS = new Set([
  'bash', 'zsh', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'ash',
  '-bash', '-zsh', '-sh', 'login',
  // Native Windows (psmux, F041): Windows PowerShell, PowerShell 7 and cmd, with or without ".exe"
  'powershell', 'pwsh', 'cmd',
])

export function isShellCommand(command: string | undefined | null): boolean {
  if (!command) return false
  return SHELL_COMMANDS.has(command.trim().toLowerCase().replace(/\.exe$/, ''))
}
