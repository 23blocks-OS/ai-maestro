/**
 * Words for an agent's credential profile (#65), safe for the browser (no file access): the profile in one line,
 * and the account chip the agent header shows.
 */
import type { AgentCredential, CredentialCheck, CredentialLogin } from '@/types/agent'

/** For people: what the agent is set to use, in one line */
export function describeCredential(cred: AgentCredential | undefined | null): string {
  if (!cred || cred.kind === 'host-login') return `the host's own login${cred?.account ? ` (${cred.account})` : ''}`
  const who = cred.account ? ` (${cred.account})` : ''
  switch (cred.kind) {
    case 'oauth-token': return `subscription token ${cred.secret}${who}`
    case 'api-key': return `API key ${cred.secret}${who}`
    case 'gateway': return `gateway ${(() => { try { return new URL(cred.baseUrl!).host } catch { return cred.baseUrl } })()} with ${cred.secret}${who}`
    case 'config-dir': return `separate login in ${cred.dir}${who}`
  }
}

/**
 * The header's account chip: what the agent is set to use, the login's email and plan when the host knows them
 * (its own login or a separate login folder), and the live check's state. No setting is the host's own login.
 */
export function accountOf(agent: { credential?: AgentCredential | null; credentialCheck?: CredentialCheck; credentialLogin?: CredentialLogin }): { label: string; state?: CredentialCheck['state']; title: string } | null {
  const cred: AgentCredential = agent.credential || { kind: 'host-login' }
  const login = agent.credentialLogin
  const who = login?.email ? ` · ${login.email}${login.plan ? ` (${login.plan})` : ''}` : ''
  const label = (cred.account || describeCredential({ ...cred, account: undefined })) + who
  const check = agent.credentialCheck
  return { label, state: check?.state, title: [`Model access: ${describeCredential(cred)}`, login?.orgName && `Organization: ${login.orgName}`, check?.detail].filter(Boolean).join('\n') }
}
