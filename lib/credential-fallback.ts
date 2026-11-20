/**
 * F128: when a Claude Code session hits its account's usage limit, move the agent to the next credential in ITS OWN
 * fallback list (`credential.fallback`, vault names). Never another agent's token, never a crew pool, never the
 * host's own login unless someone listed it. Adding a name to an agent is the governance action `secret.grant`.
 *
 * The signal is the line Claude Code writes into the conversation file (seen in field transcripts, 2.1.32x):
 *   {"type":"system","subtype":"informational","content":"Usage limit reached · continuing automatically at 5:20pm · esc to cancel"}
 *   ... "Usage limit reached again · ..."   and, when the window opens, "Usage limit reset · Continuing automatically".
 * A spend or weekly limit is also written as Claude Code's own error turn (field transcripts, 11-12 and 11-16):
 *   {"type":"assistant","isApiErrorMessage":true,"error":"rate_limit","message":{"model":"<synthetic>","content":[{"text":
 *    "You've hit your monthly spend limit · raise it at … · your 5-hour limit resets 1:40pm (America/Denver)"}]}}
 * Pure functions here; the watcher that acts on them is services/credential-fallback-service.ts.
 */
import type { AgentCredential } from '@/types/agent'

export interface UsageLimitHit {
  /** When Claude Code wrote the line (ms) */
  at: number
  /** When the window opens again (ms), from "continuing automatically at <time>"; absent when the text has none */
  resetsAt?: number
  text: string
}

const REACHED = /^Usage limit reached/i
const RESET = /^Usage limit reset/i
const AT_TIME = /(?:continuing automatically at|resets) (\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
/** Only a plan limit moves an agent: a plain transient 429 ("API Error: 429 …") also has error rate_limit */
const PLAN_LIMIT = /\bhit your .{0,40}limit\b/i

/** "at 5:20pm" after the line's time, in this host's time zone (Claude Code runs here too) */
export function resetTimeFromText(text: string, at: number): number | undefined {
  const m = AT_TIME.exec(text)
  if (!m) return undefined
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'pm') h += 12
  const d = new Date(at)
  d.setHours(h, Number(m[2] || 0), 0, 0)
  if (d.getTime() <= at) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/**
 * The limit the conversation is in right now, from its newest lines (oldest first). Null when there is none, when
 * "Usage limit reset" came after it, or when the model answered after it (the conversation went on, for example
 * after someone cancelled the wait): an old line must never move a working agent.
 */
export function usageLimitFromLines(lines: string[]): UsageLimitHit | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const answered = line.includes('"type":"assistant"')
    if (!answered && !line.includes('Usage limit')) continue
    let o: { type?: string; subtype?: string; content?: unknown; timestamp?: string; error?: string; message?: { model?: string; content?: { text?: unknown }[] } }
    try { o = JSON.parse(line) } catch { continue }
    // Claude Code writes its own errors as "<synthetic>" assistant turns: those are not answers
    if (o.type === 'assistant' && o.message?.model && o.message.model !== '<synthetic>') return null
    if (o.type === 'assistant' && o.message?.model === '<synthetic>' && o.error === 'rate_limit') {
      const text = o.message.content?.[0]?.text
      const at = Date.parse(o.timestamp || '')
      if (typeof text !== 'string' || !PLAN_LIMIT.test(text) || !Number.isFinite(at)) continue
      const resetsAt = resetTimeFromText(text, at)
      return { at, ...(resetsAt ? { resetsAt } : {}), text: text.slice(0, 200) }
    }
    if (o.type !== 'system' || typeof o.content !== 'string') continue
    if (RESET.test(o.content)) return null
    if (!REACHED.test(o.content)) continue
    const at = Date.parse(o.timestamp || '')
    if (!Number.isFinite(at)) continue
    const resetsAt = resetTimeFromText(o.content, at)
    return { at, ...(resetsAt ? { resetsAt } : {}), text: o.content.slice(0, 200) }
  }
  return null
}

/** Kinds whose credential is a vault entry, so a list of other entries can stand in for it */
export const FALLBACK_KINDS: AgentCredential['kind'][] = ['oauth-token', 'api-key', 'gateway']

/**
 * The next credential from the agent's own list: the first entry that exists in the vault and is not itself at its
 * limit. The used one goes to the end of the list, so the set of names the agent may use never changes. Null when
 * nothing qualifies (the agent then stays where it is, and the operator is told).
 */
export function chooseFallback(
  cred: AgentCredential | undefined | null,
  opts: { inVault: (name: string) => boolean; limitedUntil: (name: string) => number | undefined; now: number },
): { next: string; fallback: string[] } | null {
  if (!cred || !FALLBACK_KINDS.includes(cred.kind) || !cred.secret || !cred.fallback?.length) return null
  const next = cred.fallback.find(n => n !== cred.secret && opts.inVault(n) && !((opts.limitedUntil(n) ?? 0) > opts.now))
  if (!next) return null
  return { next, fallback: [...cred.fallback.filter(n => n !== next), cred.secret] }
}
