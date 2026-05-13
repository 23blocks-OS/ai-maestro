#!/usr/bin/env node

/**
 * Postinstall script: rebuild node-pty if the prebuild doesn't match
 * the current Node.js ABI. This handles Node version upgrades (e.g.,
 * Node 25 with ABI 141) where the shipped prebuilds are too old.
 *
 * Runs automatically after `yarn install` / `npm install`.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ptyDir = path.join(__dirname, '..', 'node_modules', 'node-pty')

// Skip if node-pty isn't installed (e.g., CI without native deps)
if (!fs.existsSync(ptyDir)) {
  process.exit(0)
}

// Quick smoke test: try to load node-pty and spawn a trivial command
try {
  const pty = require('node-pty')
  const proc = pty.spawn('echo', ['ok'], {
    name: 'xterm',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/tmp',
    env: process.env,
  })
  proc.kill()
  // Works fine, no rebuild needed
  process.exit(0)
} catch (err) {
  console.log(`[postinstall] node-pty prebuild incompatible (${err.message}), rebuilding...`)
}

// Rebuild from source
try {
  execSync('npx node-gyp rebuild', {
    cwd: ptyDir,
    stdio: 'inherit',
    timeout: 120000,
  })
  console.log('[postinstall] node-pty rebuilt successfully')
} catch (err) {
  console.error('[postinstall] node-pty rebuild failed:', err.message)
  console.error('[postinstall] Terminal features may not work. Try: npx node-gyp rebuild --directory=node_modules/node-pty')
  // Don't fail the install — the app can still run in headless/API mode
}
