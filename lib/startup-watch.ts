/**
 * "Startup blocked" (F044 item 8). A woken program that stops at a login screen, the folder-trust dialog, a resume
 * picker or a provider prompt fires no hook, and the status feed read it as Ready. After a wake that started the
 * program, if no hook report arrives within STARTUP_GRACE_MS, the pane is read once a minute: a visible input box
 * is Ready; anything else is reported as "startup blocked: <first line>" until a hook report or the input box shows.
 */
import { INPUT_PROMPT_LINE, stripDimPlaceholder } from '@/lib/pane-readback.mjs'

export const STARTUP_GRACE_MS = 2 * 60_000

/** null when the pane shows the program's input box (Ready); otherwise what the screen says, for the reason */
export function startupBlockedLine(paneWithEscapes: string): string | null {
  const lines = stripDimPlaceholder(paneWithEscapes).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!INPUT_PROMPT_LINE.test(lines[i])) continue
    const content = lines[i].replace(INPUT_PROMPT_LINE, '').replace(/[│┃|╎┆╭╮╰╯─]/g, '').trim()
    // `❯ 1. Yes, proceed` is a menu holding the keyboard (trust dialog, login method), not the input box
    if (!/^\d+\.\s/.test(content)) return null
    break
  }
  const first = lines.map(l => l.replace(/[│┃╎┆╭╮╰╯─━═]/g, '').trim()).find(l => l.length > 0)
  return (first || 'no input box on the screen').slice(0, 120)
}

interface Start { sessionName: string; workingDir?: string; at: number }
const g = globalThis as { _aimStartups?: Map<string, Start>; _aimStartupBlocked?: Map<string, string> }
const starts = (g._aimStartups ??= new Map())
const blocked = (g._aimStartupBlocked ??= new Map())

/** A wake started the program: watch it until it reports or shows its input box */
export function noteStartup(agentId: string, sessionName: string, workingDir: string | undefined, at = Date.now()): void {
  starts.set(agentId, { sessionName, workingDir, at })
  blocked.delete(sessionName)
}

/** The reason, while a session's startup is blocked */
export function startupBlockedReason(sessionName: string): string | undefined {
  return blocked.get(sessionName)
}

export interface StartupDeps {
  report: (workingDir: string) => { status: string; at: number } | null
  sessionExists: (sessionName: string) => Promise<boolean>
  capture: (sessionName: string) => Promise<string>
  now: () => number
}

/** One pass. Returns the sessions reported blocked (for tests and the log). */
export async function checkStartups(deps: StartupDeps): Promise<string[]> {
  const out: string[] = []
  for (const [agentId, s] of starts) {
    const now = deps.now()
    if (now - s.at < STARTUP_GRACE_MS) continue
    const reported = s.workingDir ? deps.report(s.workingDir) : null
    if ((reported && reported.at >= s.at) || !(await deps.sessionExists(s.sessionName))) {
      starts.delete(agentId); blocked.delete(s.sessionName); continue
    }
    const line = startupBlockedLine(await deps.capture(s.sessionName))
    if (line === null) { starts.delete(agentId); blocked.delete(s.sessionName); continue }
    const reason = `startup blocked: ${line}`
    if (blocked.get(s.sessionName) !== reason) console.warn(`[Startup] ${s.sessionName}: ${reason}`)
    blocked.set(s.sessionName, reason)
    out.push(s.sessionName)
  }
  return out
}

/** For tests */
export function resetStartupWatch(): void { starts.clear(); blocked.clear() }
