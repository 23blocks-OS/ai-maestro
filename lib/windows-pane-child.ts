/**
 * What really runs in a psmux pane (native Windows, F041).
 *
 * tmux reports the pane's foreground job as `pane_current_command`: while Claude Code runs a Bash tool call,
 * tmux still says "claude". psmux reports the newest process at the bottom of the pane's process tree instead,
 * so the same moment reads "bash" (or "sleep", "curl"...). Every check that asks "is this pane sitting at a
 * shell?" then says yes: crash restart interrupted a working agent and restarted it, and messages were held
 * back as if the agent had quit. Verified on Windows 11 with psmux 3.4.0 (an agent replying with amp-reply was
 * restarted twice).
 *
 * The fix gives psmux tmux's meaning back: when psmux names a shell, look at the pane's own process (pane_pid,
 * the shell the pane was started with). A shell with no child is at its prompt; otherwise the pane's occupant is
 * that child, which is what tmux would have said.
 */
import { execFile } from 'child_process'
import { isShellCommand } from '@/lib/shell-names'

/** Direct children of a process, by name, without ".exe" (conhost is the console host, never an occupant) */
export type ChildNames = (pid: string) => Promise<string[]>

export const windowsChildNames: ChildNames = pid => new Promise(resolve => {
  if (!/^\d+$/.test(pid)) return resolve([])
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object Name`],
    { timeout: 5000, windowsHide: true },
    (err, stdout) => resolve(err ? [] : String(stdout).split(/\r?\n/).map(s => s.trim().replace(/\.exe$/i, '')).filter(s => s && s.toLowerCase() !== 'conhost')),
  )
})

/**
 * The pane's occupant as tmux would report it. Changes nothing off Windows, when psmux names a program, or when
 * the pane's shell has no child (it really is at its prompt).
 */
export async function paneOccupant(
  info: { command?: string; pid?: string },
  opts: { platform?: string; childNames?: ChildNames } = {},
): Promise<string | undefined> {
  const platform = opts.platform ?? process.platform
  if (platform !== 'win32' || !info.pid || !isShellCommand(info.command)) return info.command
  const children = await (opts.childNames ?? windowsChildNames)(info.pid)
  return children[0] ?? info.command
}
