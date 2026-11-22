#!/usr/bin/env node
/**
 * Make an operator token for AI Maestro (lib/caller-identity.ts).
 *
 *   node scripts/operator-token.mjs            make one; refuses when one is already set
 *   node scripts/operator-token.mjs --force    replace the current one
 *   node scripts/operator-token.mjs --remove   remove it (back to session mode by default)
 *
 * The token is printed once and never stored: only its SHA-256 goes to ~/.aimaestro/operator-token.sha256
 * (mode 0600). Send it as `Authorization: Bearer <token>`. Once a token is set the server's default caller
 * mode is strict: anonymous callers are refused on the message routes. The server reads the file again
 * within a few seconds; no restart is needed.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const args = new Set(process.argv.slice(2))
const dir = path.join(os.homedir(), '.aimaestro')
const file = path.join(dir, 'operator-token.sha256')

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node scripts/operator-token.mjs [--force | --remove]')
  process.exit(0)
}

if (args.has('--remove')) {
  try { fs.unlinkSync(file); console.log(`Removed ${file}`) } catch { console.log('No operator token is set') }
  process.exit(0)
}

if (fs.existsSync(file) && !args.has('--force')) {
  console.error(`An operator token is already set (${file}). Use --force to replace it.`)
  process.exit(1)
}

const token = `aim_op_${crypto.randomBytes(32).toString('base64url')}`
const hash = crypto.createHash('sha256').update(token).digest('hex')

fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
const tmp = `${file}.${process.pid}.tmp`
fs.writeFileSync(tmp, `${hash}\n`, { mode: 0o600 })
fs.renameSync(tmp, file)
fs.chmodSync(file, 0o600)

if (process.env.AIMAESTRO_OPERATOR_TOKEN_SHA256) {
  console.error('Note: AIMAESTRO_OPERATOR_TOKEN_SHA256 is set in this environment and takes precedence over the file.')
}
console.log('Operator token (shown once; keep it in a password manager):')
console.log('')
console.log(`  ${token}`)
console.log('')
console.log(`Its SHA-256 is in ${file}. The default caller mode is now strict (AIMAESTRO_CALLER_AUTH overrides it).`)
