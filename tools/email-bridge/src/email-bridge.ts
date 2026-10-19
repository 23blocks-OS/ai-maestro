/**
 * AI Maestro Email Bridge
 *
 * Polls IMAP and tells an agent about new mail through AI Maestro. With SPLIT_MODE=on, mail from an
 * allowlisted sender that our mail server authenticated wakes the agent at once; everything else
 * goes into a digest. See docs/EMAIL-BRIDGE-TRUST-SPLIT-SPEC.md in the ai-maestro repository.
 */

import 'dotenv/config'
import fs from 'fs'
import * as yaml from 'yaml'
import { loadConfig, type Config } from './config.js'
import { loadState, saveState, emptyAccount, type BridgeState } from './state.js'
import { ImapMailbox, testConnection, type EmailAccount } from './imap-client.js'
import { maybeSendDigest, pollAccount } from './engine.js'
import { makeNotify } from './amp.js'

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

interface CredentialsYaml {
  email_accounts?: Record<string, { email: string; imap_server: string; imap_port: number; username: string; password: string }>
}

function loadCredentials(cfg: Config): Map<string, EmailAccount> {
  const accounts = new Map<string, EmailAccount>()
  try {
    const parsed = yaml.parse(fs.readFileSync(cfg.credentialsFile, 'utf8')) as CredentialsYaml
    if (!parsed?.email_accounts) {
      log('Warning: no email_accounts in the credentials file')
      return accounts
    }
    for (const creds of Object.values(parsed.email_accounts)) {
      if (cfg.watchedAccounts.includes(creds.email)) {
        accounts.set(creds.email, { email: creds.email, imapServer: creds.imap_server, imapPort: creds.imap_port, username: creds.username, password: creds.password })
      }
    }
  } catch (error) {
    log(`Error loading credentials: ${error instanceof Error ? error.message : String(error)}`)
  }
  return accounts
}

const AUTH_LOST = /AUTHENTICATIONFAILED|Authentication failed|Invalid credentials|LOGIN failed/i

async function main(): Promise<void> {
  const cfg = loadConfig()
  const notify = makeNotify(cfg, log)
  log('========================================')
  log('AI Maestro Email Bridge v0.2.0')
  log('========================================')
  log(`Mode: ${cfg.splitMode}${cfg.dryRun ? ' (DRY RUN: nothing is sent)' : ''}; poll every ${Math.round(cfg.pollIntervalMs / 1000)} s`)
  log(`Watched accounts: ${cfg.watchedAccounts.join(', ')}`)
  log(`AI Maestro: ${cfg.aimaestro.apiUrl}; recipient ${cfg.aimaestro.defaultRecipient}; digest to ${cfg.aimaestro.digestRecipient}`)
  if (cfg.splitMode === 'on') {
    if (!cfg.authservId) log('WARNING: SPLIT_MODE=on but AUTHSERV_ID is empty: no mail can be trusted, everything is digested')
    if (cfg.trustedSenders.length === 0) log('WARNING: SPLIT_MODE=on but TRUSTED_SENDERS is empty: everything is digested')
  }
  if (cfg.imapInsecureTls) log('WARNING: IMAP_INSECURE_TLS is on: the mail server certificate is not checked')

  const live = loadCredentials(cfg)
  if (live.size === 0) {
    log('ERROR: no valid email accounts found. Check the credentials file.')
    process.exit(1)
  }
  log(`Loaded ${live.size} account(s)`)

  const state: BridgeState = loadState(cfg.stateFile)
  const persist = () => { if (!cfg.dryRun) saveState(cfg.stateFile, state) }
  const offline = new Map<string, EmailAccount>()

  for (const [email, account] of [...live]) {
    if (await testConnection(account, cfg.imapInsecureTls)) log(`  ✓ ${email} - connected`)
    else {
      log(`  ✗ ${email} - unreachable (will keep retrying)`)
      live.delete(email)
      offline.set(email, account)
    }
  }

  let polling = false
  let pollTimer: NodeJS.Timeout | null = null
  let recheckTimer: NodeJS.Timeout | null = null
  let backoff = 0
  let stopping = false

  const poll = async () => {
    if (polling || stopping) return
    polling = true
    try {
      for (const [email, account] of live) {
        const client = new ImapMailbox(account, cfg.imapInsecureTls)
        try {
          const st = (state.accounts[email] ||= emptyAccount())
          const r = await pollAccount({ account: email, client, st, cfg, notify, now: () => new Date(), log, persist })
          if (r.announced || r.queued || r.skipped) log(`${email}: ${r.announced} announced, ${r.queued} queued for the digest, ${r.skipped} skipped`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (AUTH_LOST.test(message)) {
            log(`Authentication lost for ${email}; moving to offline retry`)
            live.delete(email)
            offline.set(email, account)
          } else {
            log(`Error polling ${email}: ${message}`)
          }
        } finally {
          await client.close()
        }
      }
      await maybeSendDigest({ state, cfg, notify, now: () => new Date(), log, persist })
      persist()
    } finally {
      polling = false
    }
    if (offline.size > 0 && recheckTimer === null) scheduleRecheck()
  }

  const startPolling = () => {
    const tick = async () => { await poll(); if (!stopping) pollTimer = setTimeout(tick, cfg.pollIntervalMs) }
    void tick()
  }

  // An account that cannot log in (suspended, password rotated) is retried with a growing delay:
  // failed logins are what gets an address rate-limited, so retrying hard does harm
  function scheduleRecheck(): void {
    if (offline.size === 0 || stopping) return
    backoff = backoff === 0 ? cfg.recheckMinMs : Math.min(backoff * 2, cfg.recheckMaxMs)
    log(`${offline.size} account(s) offline; next check in ${Math.round(backoff / 60000)} min`)
    recheckTimer = setTimeout(async () => {
      recheckTimer = null
      const wasEmpty = live.size === 0
      for (const [email, account] of [...offline]) {
        if (await testConnection(account, cfg.imapInsecureTls)) {
          log(`  ✓ ${email} - reconnected`)
          offline.delete(email)
          live.set(email, account)
          backoff = 0
        }
      }
      if (wasEmpty && live.size > 0) { log('Accounts recovered; starting polling'); startPolling() }
      scheduleRecheck()
    }, backoff)
  }

  if (live.size > 0) startPolling()
  else log('No accounts reachable yet; standing by until one recovers')
  scheduleRecheck()

  const shutdown = (signal: string) => {
    if (stopping) return
    stopping = true
    log(`${signal} received, shutting down`)
    if (pollTimer) clearTimeout(pollTimer)
    if (recheckTimer) clearTimeout(recheckTimer)
    persist()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch(error => {
  log(`Fatal error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exit(1)
})
