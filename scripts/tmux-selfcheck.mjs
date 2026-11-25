#!/usr/bin/env node
/**
 * tmux self-check (F045). Runs AI Maestro's tmux calls against a binary in a private server and
 * prints one line per operation. Exit 0 when all pass, 1 when any fails, 2 on a usage error.
 *
 *   node scripts/tmux-selfcheck.mjs                 # the "tmux" on PATH
 *   node scripts/tmux-selfcheck.mjs --bin psmux     # or AIM_TMUX_BIN=psmux
 *   node scripts/tmux-selfcheck.mjs --json          # machine-readable
 *   node scripts/tmux-selfcheck.mjs --no-attach     # skip the node-pty attach check
 *
 * It never touches your tmux server: everything runs on "-L aim-selfcheck-<random>", which it kills.
 */
import { runSelfCheck, formatReport } from '../lib/tmux-selfcheck.mjs'

const args = process.argv.slice(2)
let bin
let json = false
let attach = true
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--bin') bin = args[++i]
  else if (a.startsWith('--bin=')) bin = a.slice(6)
  else if (a === '--json') json = true
  else if (a === '--no-attach') attach = false
  else if (a === '-h' || a === '--help') {
    console.log('usage: node scripts/tmux-selfcheck.mjs [--bin <tmux|psmux|path>] [--json] [--no-attach]')
    process.exit(0)
  } else {
    console.error('unknown argument: ' + a)
    process.exit(2)
  }
}

try {
  const report = await runSelfCheck({
    bin, attach,
    onResult: json ? undefined : (r) => process.stdout.write((r.skipped ? 'skip' : r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name + (r.ok && !r.detail ? '' : '  : ' + (r.detail || '')) + '\n'),
  })
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(formatReport(report).split('\n').slice(-1)[0] + '  [' + report.bin + (report.version ? ' ' + report.version : '') + ', ' + report.platform + ']')
  process.exit(report.ok ? 0 : 1)
} catch (err) {
  console.error(err && err.message ? err.message : String(err))
  process.exit(2)
}
