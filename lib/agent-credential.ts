/**
 * Credential profiles (#65): which account or key an agent calls its model with, and how a launch uses it.
 *
 * The incident: eleven agents had a subscription token in `.claude/settings.local.json` `env`. Claude Code ignores
 * sign-in variables there and fell back to the host's own /login, the operator's personal account, for three hours.
 * So a profile is applied at launch by scripts/aim-launch.sh, which reads the secret from the vault (never a file,
 * never typed into the pane), and a settings file that would override or be ignored is reported.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'
import type { AgentCredential, CredentialCheck } from '@/types/agent'
import { describeCredential } from '@/lib/credential-words'
import { quote } from '@/lib/pane-shell'

export { describeCredential }

export const CREDENTIAL_KINDS = ['host-login', 'oauth-token', 'api-key', 'gateway', 'config-dir'] as const
const VAULT_NAME = /^[A-Za-z0-9_.-]{1,64}$/
const MODEL = /^[\w.:/@-]{1,120}$/
const SAFE_PATH = /^\/[\w.\/@+-]{1,300}$/

/** Check what a client sent. Returns the clean profile, null (the host's own login) or an error message. */
export function parseCredential(input: unknown): { credential: AgentCredential | null } | { error: string } {
  if (input === null || input === undefined) return { credential: null }
  const c = input as Record<string, unknown>
  if (typeof c !== 'object' || Array.isArray(c)) return { error: 'credential must be an object' }
  const kind = c.kind
  if (!CREDENTIAL_KINDS.includes(kind as any)) return { error: `credential.kind must be one of: ${CREDENTIAL_KINDS.join(', ')}` }
  const allowed = new Set(['kind', 'secret', 'baseUrl', 'model', 'dir', 'account', 'fallback'])
  if (Object.keys(c).some(k => !allowed.has(k))) return { error: 'credential has only kind, secret, baseUrl, model, dir, account and fallback: a value belongs in the vault' }
  const account = typeof c.account === 'string' ? c.account.trim().slice(0, 120) : undefined
  if (account && /[\u0000-\u001f]/.test(account)) return { error: 'credential.account is one line of text' }
  if ((kind === 'host-login' || kind === 'config-dir') && Array.isArray(c.fallback) && c.fallback.length) return { error: 'credential.fallback needs a credential kept in the vault (oauth-token, api-key or gateway)' }
  if (kind === 'host-login') return { credential: account ? { kind, account } : null }
  if (kind === 'config-dir') {
    if (typeof c.dir !== 'string' || !SAFE_PATH.test(c.dir) || c.dir.split('/').includes('..')) return { error: 'credential.dir must be an absolute folder path (letters, digits, / . _ - @ +)' }
    return { credential: { kind, dir: c.dir, ...(account ? { account } : {}) } }
  }
  if (typeof c.secret !== 'string' || !VAULT_NAME.test(c.secret)) return { error: 'credential.secret is the NAME of a vault entry (aim-secret), never the value' }
  // A value pasted where a name belongs: refuse, so it never lands in the registry
  if (/^(sk-|sk_|ey[A-Za-z0-9]{10})/.test(c.secret)) return { error: 'credential.secret looks like a key itself: store it with aim-secret and give its name' }
  const out: AgentCredential = { kind: kind as AgentCredential['kind'], secret: c.secret, ...(account ? { account } : {}) }
  // F128: other vault entries of the same kind this agent may move to on a usage limit (names, never values)
  if (c.fallback !== undefined && c.fallback !== null) {
    const f = c.fallback
    if (!Array.isArray(f) || f.length > 5 || f.some(n => typeof n !== 'string' || !VAULT_NAME.test(n) || /^(sk-|sk_|ey[A-Za-z0-9]{10})/.test(n))) {
      return { error: 'credential.fallback is a list of up to 5 vault entry NAMES (aim-secret), never values' }
    }
    const names = [...new Set(f as string[])].filter(n => n !== c.secret)
    if (names.length) out.fallback = names
  }
  if (kind === 'gateway') {
    try { const u = new URL(String(c.baseUrl || '')); if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new Error() } catch { return { error: 'credential.baseUrl must be an https address for a gateway' } }
    out.baseUrl = String(c.baseUrl)
    if (c.model !== undefined && c.model !== '') {
      if (typeof c.model !== 'string' || !MODEL.test(c.model)) return { error: 'credential.model is a model id (letters, digits, . : / @ - _)' }
      out.model = c.model
    }
  }
  return { credential: out }
}

/**
 * The words that go in front of the program in the launch command: `<launcher> <kind> [args] --`.
 * Empty for the host's own login. Every value is checked by parseCredential, so none needs quoting.
 */
/** F128: the vault names (or folder) an agent may use: its credential and its fallback list */
export function credentialNames(c: AgentCredential | undefined | null): string[] {
  if (!c) return []
  return [...(c.secret ? [c.secret] : []), ...(c.dir ? [c.dir] : []), ...(c.fallback || [])]
}

/** The names a change adds: giving an agent one of them is the governance action `secret.grant` (F118, F128) */
export function grantedNames(before: AgentCredential | undefined | null, after: AgentCredential | undefined | null): string[] {
  const had = new Set(credentialNames(before))
  return credentialNames(after).filter(n => !had.has(n))
}

/** The launcher of this platform: scripts/aim-launch.sh, or scripts/windows/aim-launch.mjs on native Windows (F041). */
export function credentialLauncherPath(repo = process.cwd(), platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.join(repo, 'scripts', 'windows', 'aim-launch.mjs') : path.join(repo, 'scripts', 'aim-launch.sh')
}

/**
 * The PowerShell form (native Windows, F041): `& 'node.exe' 'aim-launch.mjs' <kind> '<arg>'... -- `, typed after the
 * pane's variables so the launcher and the program inherit them. Every value is quoted; '' when there is no profile.
 */
export function credentialLaunchPrefixPowerShell(cred: AgentCredential | undefined | null, launcher: string, node = process.execPath): string {
  if (!cred || cred.kind === 'host-login') return ''
  const p = parseCredential(cred)
  if ('error' in p || !p.credential) return ''
  const c = p.credential
  const args = c.kind === 'config-dir' ? [c.dir!]
    : c.kind === 'gateway' ? [c.secret!, c.baseUrl!, ...(c.model ? [c.model] : [])]
      : [c.secret!]
  return `& ${quote('powershell', node)} ${quote('powershell', launcher)} ${c.kind} ${args.map(a => quote('powershell', a)).join(' ')} -- `
}

export function credentialLaunchPrefix(cred: AgentCredential | undefined | null, launcher: string): string {
  if (!cred || cred.kind === 'host-login') return ''
  const p = parseCredential(cred)
  if ('error' in p || !p.credential) return '' // a bad record launches on the host login rather than a broken command
  const c = p.credential
  const args = c.kind === 'config-dir' ? [c.dir!]
    : c.kind === 'gateway' ? [c.secret!, c.baseUrl!, ...(c.model ? [c.model] : [])]
      : [c.secret!]
  return `${launcher} ${c.kind} ${args.join(' ')} -- `
}

const IGNORED_THERE = ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR'] // Claude Code ignores these in project/local settings
const OVERRIDING = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'apiKeyHelper']

/**
 * What in the agent folder's Claude settings would defeat the profile: sign-in variables that Claude Code ignores
 * there (the incident), and credentials that would win over the profile (a leftover gateway key outranks a
 * subscription token). Names only; values are never read out.
 */
export function settingsWarnings(workingDirectory: string | undefined, cred: AgentCredential | undefined | null): string[] {
  if (!workingDirectory) return []
  const out: string[] = []
  for (const file of ['settings.json', 'settings.local.json']) {
    const p = path.join(workingDirectory, '.claude', file)
    let json: any
    try { json = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { continue }
    const env = json?.env && typeof json.env === 'object' ? Object.keys(json.env) : []
    for (const k of env.filter(k => IGNORED_THERE.includes(k))) {
      out.push(`.claude/${file} sets ${k} in env: Claude Code ignores it there, so the agent falls back to another login. Use the agent's credential setting instead, and remove it from the file.`)
    }
    const winners = [...env.filter(k => OVERRIDING.includes(k)), ...(json?.apiKeyHelper ? ['apiKeyHelper'] : [])]
    // Also for a gateway profile: the file's value would win over the profile's, so the profile would not be what runs
    for (const k of winners) {
      out.push(`.claude/${file} sets ${k}: it wins over the agent's credential setting (${describeCredential(cred)}). Remove it from the file.`)
    }
  }
  return out
}

/**
 * What a running Claude session really signs in with, as its hook reports it (#65 part 2). `via` is read from the
 * process environment in Claude Code's own order; `launched` is the kind scripts/aim-launch.sh marked when it started
 * the program (absent when something else started it); `ref` is the profile it launched with, the vault name or folder
 * (absent before 0.106.237). No value or fingerprint leaves the process.
 */
export interface CredentialSeen { via: AgentCredential['kind']; launched?: AgentCredential['kind']; ref?: string; at: number }

const isKind = (k: unknown): k is AgentCredential['kind'] => CREDENTIAL_KINDS.includes(k as any)

// The reports are kept on disk too: sessions outlive a server restart, and a deploy used to blank every check
// (field report 2026-11-19: all 11 of a crew read null after a deploy). Names and kinds only, never a value.
const seenFile = () => process.env.AIM_CREDENTIAL_SEEN_FILE || path.join(os.homedir(), '.aimaestro', 'credential-seen.json')
const persisting = () => !process.env.VITEST || !!process.env.AIM_CREDENTIAL_SEEN_FILE
const SEEN_MAX = 5000

function loadSeen(): Map<string, CredentialSeen> {
  const store = new Map<string, CredentialSeen>()
  if (!persisting()) return store
  try {
    const raw = JSON.parse(fs.readFileSync(seenFile(), 'utf8'))
    for (const [id, s] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      const r = s as Partial<CredentialSeen>
      if (id.length > 100 || !isKind(r?.via) || typeof r.at !== 'number') continue
      const ref = typeof r.ref === 'string' && (VAULT_NAME.test(r.ref) || SAFE_PATH.test(r.ref)) ? r.ref : undefined
      store.set(id, { via: r.via, ...(isKind(r.launched) ? { launched: r.launched } : {}), ...(ref ? { ref } : {}), at: r.at })
    }
  } catch { /* no file yet, or unreadable: start empty */ }
  return store
}

function saveSeen(store: Map<string, CredentialSeen>): void {
  if (!persisting()) return
  try {
    const entries = [...store.entries()].slice(-SEEN_MAX)
    fs.mkdirSync(path.dirname(seenFile()), { recursive: true })
    writeFileAtomicSync(seenFile(), JSON.stringify(Object.fromEntries(entries)), { mode: 0o600 })
  } catch (e) {
    console.warn(`[Credential] could not save the credential checks: ${(e as Error).message}`)
  }
}

const seenStore: Map<string, CredentialSeen> = ((globalThis as any)._aimCredentialSeen ??= loadSeen())

/** Record a hook's report (from the heartbeat). Anything malformed is dropped. */
export function recordCredentialSeen(agentId: string, report: unknown): void {
  const r = report as { via?: unknown; launched?: unknown; ref?: unknown } | null
  if (!agentId || !r || !isKind(r.via)) return
  const launched = isKind(r.launched) ? r.launched : undefined
  const ref = typeof r.ref === 'string' && (VAULT_NAME.test(r.ref) || SAFE_PATH.test(r.ref)) ? r.ref : undefined
  const prev = seenStore.get(agentId)
  // Same report as before: keep its time, so the agent list (and the mesh feed built on it) does not change on every heartbeat
  if (prev && prev.via === r.via && prev.launched === launched && prev.ref === ref) return
  seenStore.set(agentId, { via: r.via, ...(launched ? { launched } : {}), ...(ref ? { ref } : {}), at: Date.now() })
  saveSeen(seenStore)
}

/** Forget it when the agent is woken again: the next session reports afresh. */
export function forgetCredentialSeen(agentId: string): void { if (seenStore.delete(agentId)) saveSeen(seenStore) }

const KIND_WORDS: Record<AgentCredential['kind'], string> = {
  'host-login': "the computer's own login", 'oauth-token': 'a subscription token', 'api-key': 'an API key',
  gateway: 'a gateway key', 'config-dir': 'a separate login folder',
}

/**
 * Compare the profile with what the session reported. Null when there is nothing to compare: no profile set (the
 * agent was never told which account to use), or no report yet. `match` needs the right kind AND the launcher's mark,
 * because a token Claude Code ignores can still sit in the environment (the incident); right kind without the mark
 * is `unverified` (started by hand or by an old wrapper). The launcher's mark also names the profile it used, so a
 * switch to another token of the same kind is a `mismatch` until the session restarts (field report 2026-11-19).
 */
export function credentialCheck(cred: AgentCredential | undefined | null, agentId: string, seen = seenStore.get(agentId)): CredentialCheck | null {
  if (!seen) return null
  // No setting means the host's own login (parseCredential stores that as null), so it is checked too
  if (!cred) cred = { kind: 'host-login' }
  const at = new Date(seen.at).toISOString()
  const want = cred.kind
  // A hook cannot see a subscription token (Claude Code hides it), so without the launcher's mark the session may
  // still have one, put there by hand or by a wrapper: unproven, not wrong
  if (want === 'oauth-token' && seen.via === 'host-login' && !seen.launched) return { state: 'unverified', at, detail: `AI Maestro did not start this session with its setting, and a subscription token is invisible from outside, so it may be on ${describeCredential(cred)} or on the computer's own login. Wake it again to be sure.` }
  if (seen.via !== want) return { state: 'mismatch', at, detail: `Set to use ${describeCredential(cred)}, but the running session signs in with ${KIND_WORDS[seen.via]}.` }
  if (want !== 'host-login' && seen.launched !== want) return { state: 'unverified', at, detail: `The session has ${KIND_WORDS[seen.via]}, but AI Maestro did not start it with this setting. Wake it again to be sure it is ${describeCredential(cred)}.` }
  if (want !== 'host-login') {
    const ref = want === 'config-dir' ? cred.dir : cred.secret
    if (!seen.ref) return { state: 'unverified', at, detail: `The session was started with ${KIND_WORDS[want]}, but before AI Maestro recorded which one. Wake it again to be sure it is ${describeCredential(cred)}.` }
    if (seen.ref !== ref) return { state: 'mismatch', at, detail: `Set to use ${describeCredential(cred)}, but the running session was started with ${seen.ref}. Restart it to switch.` }
  }
  return { state: 'match', at, detail: `Running on ${describeCredential(cred)}.` }
}
