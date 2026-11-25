#!/usr/bin/env node
/**
 * AI Maestro's server on native Windows (F041): what pm2 and scripts/start-with-ssh.sh do on macOS and Linux.
 *
 * Runs `tsx server.mjs` in production mode, restarts it when it stops on its own (at most 10 times while it
 * keeps dying within 10 s of starting, as pm2's min_uptime / max_restarts), and appends its output to
 * ~/.aimaestro/logs/server.log (cut at 50 MB, as the B013 log rotation does for pm2's logs).
 *
 * Started by the "AI Maestro" scheduled task (scripts/windows/install-launcher.ps1), at login when that is on,
 * or by `ai-maestro start`. `ai-maestro stop` ends it through the pids in ~/.aimaestro/service.json.
 * The agents keep running either way: their sessions belong to the psmux server, not to this process.
 *
 * Environment: AIM_PORT (default 23000; install.ps1 -Port keeps it in the user's environment),
 * AIM_SERVICE_NO_RESTART=1 (run once, for tests).
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HOME = os.homedir()
const STATE_DIR = path.join(HOME, '.aimaestro')
const LOG_DIR = path.join(STATE_DIR, 'logs')
const LOG = path.join(LOG_DIR, 'server.log')
const STATE = path.join(STATE_DIR, 'service.json')
const MAX_LOG = 50 * 1024 * 1024
const MIN_UPTIME_MS = 10_000
const MAX_QUICK_RESTARTS = 10

fs.mkdirSync(LOG_DIR, { recursive: true })

function rotate() {
  try { if (fs.statSync(LOG).size > MAX_LOG) fs.renameSync(LOG, LOG + '.1') } catch { /* no log yet */ }
}

function log(line) {
  rotate()
  fs.appendFileSync(LOG, `[service ${new Date().toISOString()}] ${line}\n`)
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

/** Is pid a node.exe? A pid in an old state file may belong to another program by now. */
function isNode(pid) {
  if (!alive(pid)) return false
  if (process.platform !== 'win32') return true
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
    return /^"node\.exe"/i.test(out.trim())
  } catch { return false }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} }
}

function writeState(state) {
  const tmp = STATE + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, STATE)
}

// One supervisor at a time. A server left behind by a supervisor that was ended from outside (Task Scheduler
// ends only the process it started; Windows does not end its children) still holds the port: end it first.
const previous = readState()
if (previous.supervisorPid !== process.pid && isNode(previous.supervisorPid)) {
  console.error(`AI Maestro's service is already running (pid ${previous.supervisorPid})`)
  process.exit(0)
}
if (isNode(previous.serverPid)) {
  log(`ending the server left from an earlier run (pid ${previous.serverPid})`)
  try { process.kill(previous.serverPid) } catch { /* gone */ }
}

const tsxCli = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs')
if (!fs.existsSync(tsxCli)) {
  log(`cannot start: ${tsxCli} is missing. Run the installer again (install.ps1) or yarn install in ${REPO}`)
  process.exit(1)
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_PRIVATE_SKIP_LOCKFILE_CHECK: '1',
  PORT: process.env.AIM_PORT || '23000',
}
// A login item starts with the PATH Windows keeps for the user, which may not have this Node first
const nodeDir = path.dirname(process.execPath)
const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'Path'
if (!(env[pathKey] || '').toLowerCase().split(';').includes(nodeDir.toLowerCase())) env[pathKey] = `${nodeDir};${env[pathKey] || ''}`

let child = null
let stopping = false
let quickRestarts = 0

function start() {
  rotate()
  const out = fs.openSync(LOG, 'a')
  const startedAt = Date.now()
  child = spawn(process.execPath, [tsxCli, 'server.mjs'], { cwd: REPO, env, stdio: ['ignore', out, out], windowsHide: true })
  fs.closeSync(out)
  writeState({ supervisorPid: process.pid, serverPid: child.pid, port: Number(env.PORT), repo: REPO, startedAt: new Date(startedAt).toISOString() })
  log(`server started (pid ${child.pid}, port ${env.PORT})`)
  child.on('exit', (code, signal) => {
    log(`server exited (${signal || `code ${code}`})`)
    child = null
    if (stopping || process.env.AIM_SERVICE_NO_RESTART === '1') return finish(code ?? 0)
    quickRestarts = Date.now() - startedAt < MIN_UPTIME_MS ? quickRestarts + 1 : 0
    if (quickRestarts >= MAX_QUICK_RESTARTS) {
      log(`the server stopped ${MAX_QUICK_RESTARTS} times within ${MIN_UPTIME_MS / 1000}s of starting; giving up. See the lines above, then: ai-maestro start`)
      return finish(1)
    }
    setTimeout(start, Math.min(1000 * 2 ** quickRestarts, 30_000))
  })
}

function finish(code) {
  const s = readState()
  if (s.supervisorPid === process.pid) { try { fs.rmSync(STATE) } catch { /* gone */ } }
  process.exit(code)
}

function stop() {
  stopping = true
  if (child) { try { child.kill() } catch { /* gone */ } } else finish(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('SIGBREAK', stop)

start()
