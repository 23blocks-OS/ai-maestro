/**
 * Which account a Claude login on this host is: `claude auth status --json` (email, organization, plan), for an
 * agent set to the host's own login or to a separate login folder (#65 part 2). Kept 10 minutes per folder and
 * refreshed in the background, so the agent list never waits for it. The sign-in variables are removed for the
 * check, so it reports the stored login and not a token the server itself might have.
 */
import { execFile } from 'child_process'
import type { CredentialLogin } from '@/types/agent'

const FRESH_MS = 10 * 60 * 1000
const cache: Map<string, { at: number; login: CredentialLogin | null; pending?: boolean }> = ((globalThis as any)._aimClaudeLogin ??= new Map())

/** The login's account from `claude auth status --json` output, or null when it is not a stored login */
export function parseAuthStatus(stdout: string): CredentialLogin | null {
  let j: any
  try { j = JSON.parse(stdout) } catch { return null }
  if (!j?.loggedIn || j.authMethod !== 'claude.ai') return null
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : undefined)
  const out: CredentialLogin = { email: str(j.email), orgName: str(j.orgName), plan: str(j.planTier) || str(j.subscriptionType) }
  return out.email || out.orgName ? out : null
}

/** What is known now (possibly nothing yet); starts a refresh when it is missing or old */
export function loginFor(configDir?: string): CredentialLogin | null {
  const key = configDir || ''
  const hit = cache.get(key)
  if (hit && (hit.pending || Date.now() - hit.at < FRESH_MS)) return hit.login
  cache.set(key, { at: hit?.at || 0, login: hit?.login || null, pending: true })
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CONFIG_DIR']) delete env[k]
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir
  execFile('claude', ['auth', 'status', '--json'], { env, timeout: 15_000 }, (err, stdout) => {
    cache.set(key, { at: Date.now(), login: err ? (hit?.login || null) : parseAuthStatus(String(stdout)) })
  })
  return hit?.login || null
}
