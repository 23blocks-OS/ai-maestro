/**
 * An agent's AMP identity (keys, address, registration) on native Windows (F041, B040).
 *
 * On macOS and Linux the wake line typed into the pane runs `amp-init.sh --auto` when the agent has no keys yet.
 * A Windows pane runs PowerShell, which cannot run a bash script, so the server runs it here instead, in Git
 * Bash, with the environment the pane would have given it (AMP_DIR, the agent's name and id). amp-init.sh
 * exits early when the identity exists; its output goes to the server log.
 */
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { scriptArgv } from '@/lib/git-bash.mjs'

export interface AmpInitInput {
  ampDir: string
  agentName: string
  agentId: string
  cwd?: string
}

/** Runs amp-init.sh for the agent; resolves true when it ran and exited 0. Never throws. */
export function runAmpInit(input: AmpInitInput, home = os.homedir()): Promise<boolean> {
  const script = path.join(home, '.local', 'bin', 'amp-init.sh')
  if (!fs.existsSync(script)) {
    console.warn(`[AMP] ${input.agentName}: amp-init.sh is not installed (${script}); run install.ps1 again for messaging`)
    return Promise.resolve(false)
  }
  let argv: string[]
  try { argv = scriptArgv(script, ['--auto']) } catch (e) {
    console.warn(`[AMP] ${input.agentName}: ${(e as Error).message}`)
    return Promise.resolve(false)
  }
  const env = {
    ...process.env,
    // Forward slashes: bash and Windows programs both read C:/Users/...
    AMP_DIR: input.ampDir.replace(/\\/g, '/'),
    AIM_AGENT_NAME: input.agentName,
    AIM_AGENT_ID: input.agentId,
    // The pane's tmux session name tells amp-init.sh who it is; here the name is given
    CLAUDE_AGENT_NAME: input.agentName,
  }
  const cwd = input.cwd && fs.existsSync(input.cwd) ? input.cwd : home
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd, env, timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr || ''}`.trim().split('\n').slice(-5).join(' | ')
      if (err) console.warn(`[AMP] ${input.agentName}: amp-init.sh failed: ${err.message}${out ? ` — ${out}` : ''}`)
      else console.log(`[AMP] ${input.agentName}: amp-init.sh: ${out || 'done'}`)
      resolve(!err)
    })
  })
}
