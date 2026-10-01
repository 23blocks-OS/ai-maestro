#!/usr/bin/env node
/**
 * Where a Claude Code session's money goes, read from its own transcript.
 *
 *   node scripts/cost-breakdown.mjs [session.jsonl ...]
 *   (no arguments: every transcript over 3 MB changed in the last 10 days)
 *
 * Each assistant request in a transcript carries the API usage counters. One
 * request is written as several records (one per content block) with the same
 * usage, so requests are counted once by message id.
 *
 * Shares are in base-input-token equivalents: cache read 0.1, one-hour cache
 * write 2.0 (Claude Code's default on a subscription), output 5.0. They are
 * proportions of one session's cost, not dollars, and not how a subscription
 * weighs usage (unpublished). See docs/COST-OPTIMIZATION.md.
 *
 * A "cold wake" is a request after more than an hour of silence that wrote
 * over 50k tokens to the cache: the agent was idle past the cache lifetime and
 * its whole context was processed again before it did anything.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const PRICE = { read: 0.1, write: 2.0, output: 5.0, input: 1.0 }
const COLD_GAP_MS = 60 * 60 * 1000
const COLD_MIN_WRITE = 50_000

function recentTranscripts() {
  const root = path.join(os.homedir(), '.claude', 'projects')
  const cutoff = Date.now() - 10 * 24 * 3600 * 1000
  const found = []
  for (const dir of fs.readdirSync(root)) {
    const full = path.join(root, dir)
    if (!fs.statSync(full).isDirectory()) continue
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.jsonl')) continue
      const st = fs.statSync(path.join(full, f))
      if (st.size > 3e6 && st.mtimeMs > cutoff) found.push({ file: path.join(full, f), size: st.size })
    }
  }
  return found.sort((a, b) => b.size - a.size).map(x => x.file)
}

function analyse(file) {
  const requests = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let e
    try { e = JSON.parse(line) } catch { continue }
    const m = e?.message
    if (e?.type !== 'assistant' || !m?.usage || !e.timestamp) continue
    const id = m.id || e.uuid
    if (!requests.has(id)) requests.set(id, { u: m.usage, t: Date.parse(e.timestamp) })
  }
  const list = [...requests.values()].sort((a, b) => a.t - b.t)
  const sum = k => list.reduce((s, r) => s + (r.u[k] || 0), 0)
  const input = sum('input_tokens'), write = sum('cache_creation_input_tokens')
  const read = sum('cache_read_input_tokens'), output = sum('output_tokens')
  const thinking = list.reduce((s, r) => s + (r.u.output_tokens_details?.thinking_tokens || 0), 0)
  let cold = 0, wakes = 0
  for (let i = 1; i < list.length; i++) {
    const w = list[i].u.cache_creation_input_tokens || 0
    if (list[i].t - list[i - 1].t > COLD_GAP_MS && w > COLD_MIN_WRITE) { cold += w; wakes++ }
  }
  const parts = {
    'cache reads (context re-read each step)': read * PRICE.read,
    'cache writes, cold wakes after >1h idle': cold * PRICE.write,
    'cache writes, other': (write - cold) * PRICE.write,
    'output, visible (text, commands, code)': (output - thinking) * PRICE.output,
    'output, thinking': thinking * PRICE.output,
    'uncached input': input * PRICE.input,
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0) || 1
  const name = path.basename(path.dirname(file)).replace(/^-Users-[^-]+-/, '')
  console.log(`\n${name}  ${path.basename(file).slice(0, 8)}`)
  console.log(`  ${list.length} requests, average context ${Math.round((read + write + input) / Math.max(list.length, 1) / 1000)}k tokens, ${wakes} cold wakes`)
  for (const [k, v] of Object.entries(parts)) console.log(`  ${k.padEnd(42)} ${(100 * v / total).toFixed(1).padStart(5)}%`)
}

const files = process.argv.slice(2)
for (const f of files.length ? files : recentTranscripts()) analyse(f)
