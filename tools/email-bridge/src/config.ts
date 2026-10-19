/**
 * Configuration, all from environment variables (a .env file is loaded by the entry point).
 * Nothing here is a secret: the mailbox credentials live in the credentials YAML, never in env.
 */

import os from 'os'
import path from 'path'

export type SplitMode = 'off' | 'shadow' | 'on'

export interface Config {
  /** off = one notification per mail (today); shadow = the same, plus a classification log; on = the split */
  splitMode: SplitMode
  pollIntervalMs: number
  recheckMinMs: number
  recheckMaxMs: number
  watchedAccounts: string[]
  aimaestro: { apiUrl: string; defaultRecipient: string; digestRecipient: string; botAgent: string; hostId: string }
  credentialsFile: string
  stateFile: string
  debug: boolean
  /** Log what would be sent and send nothing */
  dryRun: boolean
  trustedSenders: string[]
  /** The receiving mail server's authserv-id; empty means nobody can be trusted */
  authservId: string
  digestTimes: string[]
  digestMaxPending: number
  digestSubjects: boolean
  trustedIncludeBody: boolean
  trustedBodyMaxChars: number
  fieldMaxChars: number
  maxFetchBytes: number
  maxSendRetries: number
  /** Accept any TLS certificate from the mail server. Off by default: the trust decision rests on headers fetched over this connection. */
  imapInsecureTls: boolean
}

type Env = Record<string, string | undefined>

function int(env: Env, key: string, fallback: number, min = 0): number {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} must be an integer >= ${min}, got "${raw}"`)
  return n
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const v = raw.trim().toLowerCase()
  if (['true', '1', 'yes'].includes(v)) return true
  if (['false', '0', 'no'].includes(v)) return false
  throw new Error(`${key} must be true or false, got "${raw}"`)
}

function list(env: Env, key: string): string[] {
  return (env[key] || '').split(',').map(s => s.trim()).filter(Boolean)
}

export function parseDigestTimes(raw: string[]): string[] {
  for (const t of raw) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`DIGEST_TIMES entries must be HH:MM (24h), got "${t}"`)
  }
  return [...raw].sort()
}

export function loadConfig(env: Env = process.env): Config {
  const mode = (env.SPLIT_MODE || 'off').trim().toLowerCase()
  if (mode !== 'off' && mode !== 'shadow' && mode !== 'on') throw new Error(`SPLIT_MODE must be off, shadow or on, got "${env.SPLIT_MODE}"`)
  const defaultRecipient = env.DEFAULT_RECIPIENT || 'pas-lola'
  const times = list(env, 'DIGEST_TIMES')
  return {
    splitMode: mode,
    // Two minutes when the split is on (the wake is the point); today's fifteen otherwise
    pollIntervalMs: int(env, 'POLL_INTERVAL_MS', mode === 'on' ? 120_000 : 900_000, 1000),
    recheckMinMs: int(env, 'RECHECK_MIN_MS', 300_000, 1000),
    recheckMaxMs: int(env, 'RECHECK_MAX_MS', 3_600_000, 1000),
    watchedAccounts: list(env, 'WATCHED_ACCOUNTS'),
    aimaestro: {
      apiUrl: (env.AIMAESTRO_URL || 'http://127.0.0.1:23000').replace(/\/$/, ''),
      defaultRecipient,
      digestRecipient: env.DIGEST_RECIPIENT || defaultRecipient,
      botAgent: env.BOT_AGENT || 'email-bot',
      hostId: env.HOST_ID || 'mini-lola',
    },
    credentialsFile: env.CREDENTIALS_FILE || path.join(os.homedir(), 'lola', 'brain', 'companies-credentials.yaml'),
    stateFile: env.STATE_FILE || path.join(os.homedir(), 'tools', 'email-bridge', 'email-state.json'),
    debug: bool(env, 'DEBUG', false),
    dryRun: bool(env, 'DRY_RUN', false),
    trustedSenders: list(env, 'TRUSTED_SENDERS').map(s => s.toLowerCase()),
    authservId: (env.AUTHSERV_ID || '').trim().toLowerCase(),
    digestTimes: parseDigestTimes(times.length > 0 ? times : ['08:00', '13:00', '18:00']),
    digestMaxPending: int(env, 'DIGEST_MAX_PENDING', 25, 1),
    digestSubjects: bool(env, 'DIGEST_SUBJECTS', true),
    trustedIncludeBody: bool(env, 'TRUSTED_INCLUDE_BODY', false),
    trustedBodyMaxChars: int(env, 'TRUSTED_BODY_MAX_CHARS', 2000, 1),
    fieldMaxChars: int(env, 'FIELD_MAX_CHARS', 120, 10),
    maxFetchBytes: int(env, 'MAX_FETCH_BYTES', 200_000, 1000),
    maxSendRetries: int(env, 'MAX_SEND_RETRIES', 5, 1),
    imapInsecureTls: bool(env, 'IMAP_INSECURE_TLS', false),
  }
}
