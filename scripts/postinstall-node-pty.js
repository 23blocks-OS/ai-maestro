#!/usr/bin/env node

/**
 * Make sure node-pty loads, and rebuild it when it does not: no prebuild for this platform (Linux has
 * none, #740) or one built for another Node ABI (e.g. Node 25, ABI 141).
 *
 * Runs after `yarn install` / `npm install`. The installers also run it themselves with --strict,
 * because when node-pty's own compile fails, yarn stops before this postinstall ever runs.
 * --strict: exit 1 when node-pty still does not load, so the caller can stop before restarting into
 * a crash loop. Without it the install never fails (the app can still run in headless/API mode).
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const strict = process.argv.includes('--strict')

// Not installed: fine for a plain postinstall (e.g., CI without native deps), a failed install under --strict
if (!fs.existsSync(path.join(root, 'node_modules', 'node-pty'))) {
  if (strict) console.error('[postinstall] node-pty is not installed: yarn install did not finish')
  process.exit(strict ? 1 : 0)
}

// In a child process: a failed native load in this one would stick
const SMOKE = "const p=require('node-pty').spawn('echo',['ok'],{name:'xterm',cols:80,rows:24,cwd:process.env.HOME||'/tmp',env:process.env});p.kill()"
function loads() {
  try {
    execSync(`"${process.execPath}" -e "${SMOKE}"`, { cwd: root, stdio: 'pipe', timeout: 30000 })
    return true
  } catch (err) {
    return String(err.stderr || err.message).split('\n').find(l => /^\w*Error:/.test(l)) || 'does not load'
  }
}

const first = loads()
if (first === true) process.exit(0)
console.log(`[postinstall] node-pty does not load (${first}), rebuilding...`)

// npm rebuild works where yarn's install-time compile fails (#740)
try {
  execSync('npm rebuild node-pty', { cwd: root, stdio: 'inherit', timeout: 300000 })
} catch (err) {
  console.error('[postinstall] node-pty rebuild failed:', err.message)
}

if (loads() === true) {
  console.log('[postinstall] node-pty rebuilt successfully')
  process.exit(0)
}
console.error('[postinstall] node-pty still does not load. Terminals will not work, and the server will not start.')
console.error('[postinstall] It needs a C++ toolchain and Python 3 (Linux: build-essential python3). Then run: npm rebuild node-pty')
process.exit(strict ? 1 : 0)
