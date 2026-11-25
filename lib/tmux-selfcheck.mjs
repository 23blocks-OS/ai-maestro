/**
 * tmux self-check (F045): run the tmux calls AI Maestro makes against any tmux-compatible binary,
 * in a private server, and name each operation that fails.
 *
 * Why: F041 (Windows with psmux) needs to know exactly which of our calls a given multiplexer
 * accepts. The same probe catches tmux version differences on Linux and macOS. Ported from lolad's
 * "lolad doctor" and its conformance suite (CamiloCaceres/lolad, internal/tmux/conformance_test.go).
 *
 * What it tests: the argv the app really sends. Every check builds its command with the builders in
 * lib/tmux-runtime.mjs (or the literal argv of the few call sites outside it) and passes it through
 * exactTargets(), the same as lib/tmux-safe.mjs does. Only "-L <private socket>" is added in front.
 *
 * Safety, from both projects' history:
 *   - Private server only: every call starts with "-L aim-selfcheck-<pid>-<rand>". Never a bare
 *     kill-server; the cleanup is "-L <ours> kill-server".
 *   - A canary runs first: if the binary cannot start a private session, nothing else runs.
 *   - Re-entry guard: the fake agent and the probe refuse to run when AIM_SELFCHECK is set, so a pane
 *     can never start another probe (lolad once started ~1,800 tmux servers that way).
 *   - The fake agent is a Node script (Node is already required), not a shell script, so it runs the
 *     same on Windows.
 */

import { execFile, spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { exactTargets, resolveExecutable } from './tmux-safe.mjs'
import { argv, attachCommand } from './tmux-runtime.mjs'

export const SELFCHECK_ENV = 'AIM_SELFCHECK'
const OP_TIMEOUT_MS = 10_000
const WAIT_MS = 12_000

/**
 * The fake agent typed into the pane. It reads raw keys, as Claude Code, Codex and other agent TUIs do
 * (Windows' line mode does not end a line on a bare LF, so a line-mode reader would test the console,
 * not the multiplexer). Enter or LF ends a line, which is echoed as "ECHO:<line>"; BSpace edits;
 * C-c exits 130; the line "exit N" exits with N.
 */
export const FAKE_AGENT = [
  "process.stdout.write('DIR=' + process.cwd() + '\\n')",
  "process.stdout.write('\\x1b[32mPROMPT_READY\\x1b[0m\\n')",
  "if (process.stdin.isTTY) process.stdin.setRawMode(true)",
  "let line = []",
  "process.stdin.on('data', (chunk) => {",
  "  for (const b of chunk) {",
  "    if (b === 0x03) process.exit(130)",
  "    if (b === 0x0d || b === 0x0a) {",
  "      const text = Buffer.from(line).toString('utf8'); line = []",
  "      const m = /^exit (\\d+)$/.exec(text.trim())",
  "      if (m) process.exit(Number(m[1]))",
  "      process.stdout.write('ECHO:' + text + '\\n')",
  "    } else if (b === 0x7f || b === 0x08) {",
  "      let b; do { b = line.pop() } while (line.length && (b & 0xc0) === 0x80)",
  "    } else if (b !== 0x1b) line.push(b)",
  "  }",
  "})",
  "",
].join('\n')

/** The binary to check: --bin, then AIM_TMUX_BIN, then "tmux". */
export function resolveBinary(explicit) {
  return explicit || process.env.AIM_TMUX_BIN || 'tmux'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/**
 * @param {{ bin?: string, attach?: boolean, onResult?: (r: CheckResult) => void }} [opts]
 * @returns {Promise<{ ok: boolean, bin: string, version: string, platform: string, results: CheckResult[] }>}
 *
 * @typedef {{ name: string, ok: boolean, skipped?: boolean, ms: number, detail?: string }} CheckResult
 */
export async function runSelfCheck({ bin, attach = true, onResult } = {}) {
  if (process.env[SELFCHECK_ENV]) {
    throw new Error(SELFCHECK_ENV + ' is set: refusing to start a self-check from inside a self-check')
  }
  const binary = resolveBinary(bin)
  const socket = 'aim-selfcheck-' + process.pid + '-' + crypto.randomBytes(4).toString('hex')
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-selfcheck-'))
  const session = 'aimcheck'
  const results = []

  /** One call: "-L <socket>" + the app's argv with exact targets. */
  const run = (args, { timeout = OP_TIMEOUT_MS, input } = {}) => new Promise((resolve, reject) => {
    const child = execFile(binary, ['-L', socket, ...exactTargets(args)], {
      encoding: 'utf8', timeout, windowsHide: true, cwd: work,
      env: { ...process.env, [SELFCHECK_ENV]: '1' },
    }, (err, stdout, stderr) => {
      if (err) {
        const why = (stderr || '').trim() || err.message
        reject(new Error(why.split('\n').slice(0, 3).join(' | ')))
      } else resolve(stdout)
    })
    if (input != null) child.stdin.end(input)
  })
  const capture = (lines = 200) => run(argv.capturePane(session, lines, { join: true })).catch(() => '')
  const display = (fmt, target = session) => run(['display-message', '-p', '-t', target, fmt]).then(s => s.trim())

  async function waitFor(pred, what) {
    const deadline = Date.now() + WAIT_MS
    let last = ''
    while (Date.now() < deadline) {
      last = await capture()
      if (pred(last)) return last
      await sleep(100)
    }
    const tail = last.trim().split('\n').slice(-4).join(' | ')
    throw new Error('timed out waiting for ' + what + (tail ? '; pane ends: ' + tail : '; pane is empty'))
  }

  async function check(name, fn, { skip } = {}) {
    const started = Date.now()
    let r
    if (skip) r = { name, ok: true, skipped: true, ms: 0, detail: skip }
    else {
      try {
        const detail = await fn()
        r = { name, ok: true, ms: Date.now() - started, ...(detail ? { detail: String(detail) } : {}) }
      } catch (err) {
        r = { name, ok: false, ms: Date.now() - started, detail: err && err.message ? err.message : String(err) }
      }
    }
    results.push(r)
    onResult && onResult(r)
    return r.ok && !r.skipped
  }

  let version = ''
  try {
    version = await new Promise((resolve) => execFile(binary, ['-V'], { encoding: 'utf8', timeout: 5000, windowsHide: true },
      (err, out, errOut) => resolve(err ? '' : (out || errOut || '').trim())))
    fs.writeFileSync(path.join(work, 'fake-agent.mjs'), FAKE_AGENT)

    // Canary: nothing else runs unless a private, detached session can start in a given directory
    const started = await check('new-session -d -s -c (canary)', () => run(argv.newSession(session, work)))
    if (!started) return finish()

    await check('has-session -t (exact name)', async () => {
      await run(argv.hasSession(session))
      const prefix = await run(argv.hasSession(session.slice(0, -1))).then(() => true, () => false)
      if (prefix) throw new Error('"' + session.slice(0, -1) + '" matched "' + session + '": targets are not exact')
    })
    await check('list-sessions -F #{session_name}', async () => {
      const out = await run(argv.listSessionNames())
      if (!out.split(/\r?\n/).includes(session)) throw new Error('session missing from: ' + JSON.stringify(out.slice(0, 120)))
    })
    await check('list-sessions -F (registry discovery format)', async () => {
      // lib/agent-runtime.ts listSessions
      const out = await run(['list-sessions', '-F', '#{session_name}\t#{session_windows}\t#{session_created}\t#{pane_current_path}'])
      const row = out.split(/\r?\n/).find(l => l.startsWith(session + '\t'))
      if (!row) throw new Error('no row for the session in ' + JSON.stringify(out.slice(0, 160)))
      const [, windows, created, cwd] = row.split('\t')
      const bad = []
      if (!/^\d+$/.test(windows || '')) bad.push('session_windows=' + JSON.stringify(windows))
      if (!/^\d{9,}$/.test(created || '')) bad.push('session_created=' + JSON.stringify(created))
      if (!cwd) bad.push('pane_current_path is empty')
      if (bad.length) throw new Error(bad.join(', '))
    })
    await check('display-message -p #{pane_current_path}', async () => {
      const cwd = await display('#{pane_current_path}')
      const norm = (p) => { try { return fs.realpathSync.native(p).toLowerCase() } catch { return String(p).toLowerCase() } }
      if (norm(cwd) !== norm(work)) throw new Error('got ' + JSON.stringify(cwd) + ', want ' + JSON.stringify(work))
    })
    let shellName = ''
    await check('display-message -p #{pane_current_command} (shell)', async () => {
      shellName = await display('#{pane_current_command}')
      if (!shellName) throw new Error('empty')
      return shellName
    })
    await check('display-message -p #{pane_pid}', async () => {
      const pid = await display('#{pane_pid}')
      if (!/^\d+$/.test(pid) || Number(pid) <= 0) throw new Error('got ' + JSON.stringify(pid))
    })

    // Launch the way the app launches a program: type it into the pane's shell and press Enter
    const agentUp = await check('send-keys -l + Enter (launch a program)', async () => {
      await run(argv.sendLiteral(session, 'node fake-agent.mjs'))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => p.includes('PROMPT_READY'), 'the fake agent to start')
    })
    const needAgent = agentUp ? undefined : 'needs the fake agent, which did not start'

    await check('display-message -p #{pane_current_command} (program)', async () => {
      const cmd = await display('#{pane_current_command}')
      if (!/node/i.test(cmd)) throw new Error('got ' + JSON.stringify(cmd) + ' while node runs (shell was ' + JSON.stringify(shellName) + ')')
      return cmd
    }, { skip: needAgent })
    await check('capture-pane -p -e (escapes kept)', async () => {
      const out = await run(argv.capturePaneRaw(session, 200))
      if (!out.includes('PROMPT_READY')) throw new Error('text missing')
      if (!out.includes('\x1b[')) throw new Error('no escape sequences in the capture')
    }, { skip: needAgent })
    await check('capture-pane -e -p -S (history replay)', async () => {
      const out = await run(argv.captureHistory(session, 5000))
      if (!out.includes('PROMPT_READY')) throw new Error('text missing')
    }, { skip: needAgent })

    const literal = 'héllo 世界 "quoted" \'single\' $HOME; echo not-a-shell'
    await check('send-keys -l (Unicode, quotes, $, ;)', async () => {
      await run(argv.sendLiteral(session, literal))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => p.includes('ECHO:' + literal), 'the echoed literal')
    }, { skip: needAgent })
    await check('send-keys -l (trailing ;)', async () => {
      await run(argv.sendLiteral(session, 'ends-with;'))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => p.includes('ECHO:ends-with;'), '"ECHO:ends-with;" (a trailing ; can be eaten by the command parser)')
    }, { skip: needAgent })
    await check('send-keys -l (embedded newline)', async () => {
      await run(argv.sendLiteral(session, 'line-one\nline-two'))
      await waitFor(p => p.includes('ECHO:line-one'), '"ECHO:line-one" (the newline must arrive as a newline, not as "\\n")')
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => p.includes('ECHO:line-two'), '"ECHO:line-two"')
    }, { skip: needAgent })
    await check('send-keys -N 3 BSpace', async () => {
      await run(argv.sendLiteral(session, 'editXYZ'))
      await run(argv.repeatKey(session, 'BSpace', 3))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => /ECHO:edit\s*$/m.test(p), '"ECHO:edit"')
    }, { skip: needAgent })
    await check('send-keys Escape', async () => {
      await run(argv.sendKey(session, 'Escape'))
      await run(argv.sendLiteral(session, 'after-escape'))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => p.includes('after-escape'), 'text typed after Escape')
    }, { skip: needAgent })
    await check('load-buffer + paste-buffer -d -r (multi-line paste)', async () => {
      const file = path.join(work, 'paste.txt')
      fs.writeFileSync(file, 'paste-one\npaste-two\n')
      const buffer = 'aimaestro-selfcheck'
      await run(argv.loadBuffer(buffer, file))
      await run(argv.pasteBuffer(session, buffer))
      await waitFor(p => p.includes('ECHO:paste-one') && p.includes('ECHO:paste-two'), 'both pasted lines')
      const left = await run(['list-buffers', '-F', '#{buffer_name}']).catch(() => '')
      if (left.split(/\r?\n/).includes(buffer)) throw new Error('paste-buffer -d did not delete the buffer')
    }, { skip: needAgent })
    await check('copy-mode -e / #{pane_in_mode} / send-keys -X', async () => {
      await run(argv.enterCopyMode(session))
      const inMode = (await run(argv.paneInMode(session))).trim()
      if (inMode !== '1') throw new Error('pane_in_mode=' + JSON.stringify(inMode) + ' after copy-mode, want "1"')
      await run(argv.scroll(session, 'up', 2))
      await run(argv.cancelCopyMode(session))
      const after = (await run(argv.paneInMode(session))).trim()
      if (after !== '0') throw new Error('pane_in_mode=' + JSON.stringify(after) + ' after cancel, want "0"')
    })
    await check('set-option -t mouse off', () => run(argv.setOption(session, 'mouse', 'off')))
    await check('set-option -w -t alternate-screen off', () => run(argv.setOption(session, 'alternate-screen', 'off', { window: true })))
    await check('set-environment -t / -r', async () => {
      // lib/agent-runtime.ts setEnvironment / unsetEnvironment, services/sessions-service.ts (AMP_DIR, AIM_AGENT_*)
      await run(['set-environment', '-t', session, 'AIM_SELFCHECK_VAR', 'value-1'])
      const shown = await run(['show-environment', '-t', session, 'AIM_SELFCHECK_VAR'])
      if (!shown.includes('AIM_SELFCHECK_VAR=value-1')) throw new Error('show-environment gave ' + JSON.stringify(shown.trim()))
      await run(['set-environment', '-t', session, '-r', 'AIM_SELFCHECK_VAR'])
    })
    await check('program exit returns to the shell', async () => {
      await run(argv.sendLiteral(session, 'exit 3'))
      await run(argv.sendKey(session, 'Enter'))
      const deadline = Date.now() + WAIT_MS
      let cmd = ''
      while (Date.now() < deadline) {
        cmd = await display('#{pane_current_command}').catch(() => '')
        if (cmd && !/node/i.test(cmd)) return cmd
        await sleep(150)
      }
      throw new Error('pane_current_command still ' + JSON.stringify(cmd))
    }, { skip: needAgent })
    await check('send-keys C-c (interrupt)', async () => {
      await run(argv.sendLiteral(session, 'node fake-agent.mjs'))
      await run(argv.sendKey(session, 'Enter'))
      const deadline = Date.now() + WAIT_MS
      while (!/node/i.test(await display('#{pane_current_command}').catch(() => ''))) {
        if (Date.now() > deadline) throw new Error('fake agent did not start again')
        await sleep(150)
      }
      await run(argv.sendKey(session, 'C-c'))
      while (/node/i.test(await display('#{pane_current_command}').catch(() => 'node'))) {
        if (Date.now() > deadline + WAIT_MS) throw new Error('program still running after C-c')
        await sleep(150)
      }
    }, { skip: needAgent })

    await check('attach-session (node-pty, read-only)', () => attachProbe(binary, socket, work), {
      skip: attach ? undefined : 'disabled (--no-attach)',
    })

    await check('rename-session -t old new', async () => {
      // lib/agent-runtime.ts renameSession, scripts/register-agent-from-session.mjs
      await run(['rename-session', '-t', session, session + '2'])
      await run(argv.hasSession(session + '2'))
      await run(['rename-session', '-t', session + '2', session])
    })
    await check('kill-session -t =name (program running)', async () => {
      // hibernate's last step: the agent may still be running when the session is killed
      await run(argv.sendLiteral(session, 'node fake-agent.mjs'))
      await run(argv.sendKey(session, 'Enter'))
      await waitFor(p => (p.match(/PROMPT_READY/g) || []).length >= 1, 'the fake agent')
      await run(argv.killSession(session))
      const still = await run(argv.hasSession(session)).then(() => true, () => false)
      if (still) throw new Error('session still exists')
    })
  } finally {
    await new Promise((resolve) => execFile(binary, ['-L', socket, 'kill-server'], { timeout: 5000, windowsHide: true }, () => resolve()))
    // tmux 3.5a can leave the socket file of a killed server behind; it is ours, so remove it
    if (process.platform !== 'win32' && typeof process.getuid === 'function') {
      try { fs.rmSync(path.join(process.env.TMUX_TMPDIR || '/tmp', 'tmux-' + process.getuid(), socket), { force: true }) } catch { /* not there */ }
    }
    try { fs.rmSync(work, { recursive: true, force: true }) } catch { /* Windows may hold a file briefly */ }
  }
  return finish()

  function finish() {
    return {
      ok: results.length > 0 && results.every(r => r.ok),
      bin: binary, version, platform: process.platform + '-' + process.arch, results,
    }
  }
}

/**
 * The browser terminal attaches through node-pty (server.mjs). On Windows that is ConPTY, which is the
 * part of F041 nothing has tested yet. Read-only, so the probe cannot type into or resize the pane.
 */
async function attachProbe(binary, socket, cwd) {
  let pty
  try {
    pty = (await import('node-pty')).default
  } catch (err) {
    throw new Error('node-pty did not load: ' + (err && err.message))
  }
  const { args } = attachCommand('aimcheck', { readOnly: true })
  const term = pty.spawn(resolveExecutable(binary), ['-L', socket, ...args], {
    name: 'xterm-256color', cols: 100, rows: 30, cwd,
    env: { ...process.env, [SELFCHECK_ENV]: '1' },
  })
  let seen = ''
  term.onData(d => { seen += d })
  try {
    const deadline = Date.now() + WAIT_MS
    while (Date.now() < deadline) {
      if (/PROMPT_READY|ECHO:/.test(seen.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ''))) return
      await sleep(100)
    }
    throw new Error('no pane content through the attached client; got ' + JSON.stringify(seen.slice(0, 160)))
  } finally {
    try { term.kill() } catch { /* already gone */ }
  }
}

/** Plain-text report, one line per operation. */
export function formatReport(report) {
  const lines = ['Self-check of ' + report.bin + (report.version ? ' (' + report.version + ')' : '') + ' on ' + report.platform]
  for (const r of report.results) {
    const tag = r.skipped ? 'skip' : r.ok ? 'ok  ' : 'FAIL'
    lines.push(tag + '  ' + r.name + (r.detail ? '  : ' + r.detail : ''))
  }
  const failed = report.results.filter(r => !r.ok).length
  const skipped = report.results.filter(r => r.skipped).length
  lines.push(failed ? failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : '') : 'all passed' + (skipped ? ' (' + skipped + ' skipped)' : ''))
  return lines.join('\n')
}

/** True when the binary can be executed at all (for test skips). */
export function binaryAvailable(bin) {
  const r = spawnSync(resolveBinary(bin), ['-V'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
  return !r.error && r.status === 0
}
