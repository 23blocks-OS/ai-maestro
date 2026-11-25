#!/usr/bin/env node
/**
 * Launch an agent's program with its credential profile (#65) on native Windows (F041). scripts/aim-launch.sh is
 * the macOS and Linux form; AI Maestro types this one into the agent's PowerShell pane:
 *
 *   node aim-launch.mjs oauth-token <vault name> -- <command...>
 *   node aim-launch.mjs api-key     <vault name> -- <command...>
 *   node aim-launch.mjs gateway     <vault name> <base url> [model] -- <command...>
 *   node aim-launch.mjs config-dir  <folder> -- <command...>
 *
 * The same rules as the bash form: the secret is read from the vault at launch (on Windows, DPAPI: encrypted for
 * this Windows account) and is never typed into the pane or logged; the variables that outrank the profile are
 * cleared; spaces and line breaks in a pasted token are removed. The program keeps the pane's console, so what it
 * prints is not scrubbed (as `aim-secret exec --tty`); Claude Code does not print its token.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSecret } from '../../lib/secret-vault.mjs'
import { scriptArgv } from '../../lib/git-bash.mjs'
import { resolveExecutable } from '../../lib/tmux-safe.mjs'

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const die = (msg, code = 2) => { process.stderr.write(`aim-launch: ${msg}\n`); process.exit(code) }

const argv = process.argv.slice(2)
const kind = argv.shift() || ''
let secret = '', base = '', model = '', dir = ''
if (kind === 'oauth-token' || kind === 'api-key') secret = argv.shift() || ''
else if (kind === 'gateway') { secret = argv.shift() || ''; base = argv.shift() || ''; if (argv[0] !== '--') model = argv.shift() || '' }
else if (kind === 'config-dir') dir = argv.shift() || ''
else die(`unknown credential kind '${kind}'`)
if (argv[0] === '--') argv.shift()
if (argv.length === 0) die('no command after --')

const env = { ...process.env }
for (const k of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN']) delete env[k]
env.AIM_CREDENTIAL_VIA = kind // the Claude Code hook reports this mark back: the live check on the agent card
env.AIM_CREDENTIAL_REF = secret || dir // which profile, by vault name or folder, never a value

/** A bash helper of this checkout, in Git Bash; a failure is said and does not stop the launch. */
function helper(script, args, what) {
  try {
    const [cmd, ...rest] = scriptArgv(path.join(SCRIPTS, script), args)
    const r = spawnSync(cmd, rest, { env, stdio: 'ignore', windowsHide: true, timeout: 60_000 })
    if (r.status !== 0) process.stderr.write(`aim-launch: could not ${what}\n`)
  } catch (e) {
    process.stderr.write(`aim-launch: could not ${what}: ${e.message}\n`)
  }
}

if (kind === 'config-dir') {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`no folder ${dir}`)
  env.CLAUDE_CONFIG_DIR = dir
  // Claude Code reads this folder's settings.json and skills/, not ~/.claude: put the AI Maestro hook and skills there
  helper('claude-hooks/install-hooks.sh', ['-y', '--claude-config-dir', dir], `add the AI Maestro hook to ${dir}\\settings.json (messages and status may not reach this agent)`)
  helper('sync-agent-skills.sh', [dir], `copy the AI Maestro skills to ${dir}\\skills`)
} else {
  const variable = kind === 'oauth-token' ? 'CLAUDE_CODE_OAUTH_TOKEN' : kind === 'api-key' ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'
  let value
  try { value = await getSecret(secret) } catch (e) { die(e.message) }
  value = (value || '').replace(/\s+/g, '')
  if (!value) die(`the vault entry ${secret} for ${variable} is empty or not set`)
  env[variable] = value
  if (kind === 'gateway') {
    env.ANTHROPIC_BASE_URL = base
    if (model) env.ANTHROPIC_MODEL = model
  }
}

// The program takes over the console. Ctrl+C reaches it directly; this process only waits for it.
const [command, ...args] = argv
const file = resolveExecutable(command, { env })
const viaCmd = /\.(cmd|bat)$/i.test(file) // npm's shims run only through cmd.exe
const child = spawn(viaCmd ? `"${file}"` : file, args, { env, stdio: 'inherit', ...(viaCmd && { shell: true }) })
process.on('SIGINT', () => {})
child.on('error', (e) => die(`cannot run ${command}: ${e.code || e.message}`, 127))
child.on('close', (code, signal) => process.exit(code === null ? (signal ? 128 : 1) : code))
