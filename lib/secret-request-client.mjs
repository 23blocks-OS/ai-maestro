// The agent's side of a secret request (F033): `aim-secret request NAME`.
// It finds out which agent it is running as, asks the local AI Maestro to show the user a card,
// and returns at once. The value is typed by the user into AI Maestro, never into this command.

import { execFileSync } from 'node:child_process'
import { hasSecret, assertSecretName, VaultError } from './secret-vault.mjs'

export function baseUrl() {
  return (process.env.AIM_URL || 'http://localhost:23000').replace(/\/+$/, '')
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
  let data = null
  try { data = await res.json() } catch { /* not json */ }
  return { status: res.status, data }
}

/** This agent's id: from the environment, else from the tmux session this command runs in. */
export async function resolveAgentId(env = process.env) {
  const fromEnv = env.AIM_AGENT_ID || env.AIMAESTRO_AGENT_ID
  if (fromEnv) return fromEnv
  const pane = env.TMUX_PANE
  if (!env.TMUX || !pane) return null // not inside a tmux session: do not guess from the default server
  let session
  try {
    session = execFileSync('tmux', ['display-message', '-p', '-t', pane, '#S'], { encoding: 'utf8', timeout: 3000 }).trim()
  } catch {
    return null
  }
  if (!session) return null
  const { status, data } = await getJson(`${baseUrl()}/api/agents`)
  if (status !== 200 || !data) return null
  const agents = Array.isArray(data) ? data : data.agents || []
  const match = agents.find((a) => a && (a.name === session || a.id === session))
  return match ? match.id : null
}

/**
 * Returns { code, text }. Codes: 0 asked or already stored, 2 bad name, 4 could not reach AI Maestro
 * or identify the agent, 5 AI Maestro refused.
 */
export async function requestSecret(name, note) {
  try {
    assertSecretName(name)
  } catch (e) {
    return { code: 2, text: e instanceof VaultError ? e.message : 'invalid secret name' }
  }
  if (await hasSecret(name)) {
    return { code: 0, text: `${name} is already stored. Use it with: aim-secret exec --use ${name} -- <command>. Never print or ask for its value.` }
  }
  const agentId = await resolveAgentId()
  if (!agentId) {
    return { code: 4, text: 'Could not tell which agent this is. Run it inside the agent\'s tmux session, or set AIM_AGENT_ID.' }
  }
  let res
  try {
    res = await getJson(`${baseUrl()}/api/agents/${encodeURIComponent(agentId)}/secret-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, note }),
    })
  } catch {
    return { code: 4, text: `Could not reach AI Maestro at ${baseUrl()}. Is it running?` }
  }
  if (res.status === 200 && res.data && res.data.alreadyStored) {
    return { code: 0, text: `${name} is already stored. Use it with: aim-secret exec --use ${name} -- <command>. Never print or ask for its value.` }
  }
  if (res.status === 201 || res.status === 200) {
    return {
      code: 0,
      text: `Asked the user to store ${name}; a card is waiting in their AI Maestro chat. End your turn now. You will get a message when it is stored or declined. Do not ask for the value in the chat.`,
    }
  }
  const why = res.data && (res.data.message || res.data.error)
  return { code: 5, text: `AI Maestro refused the request (${res.status})${why ? `: ${String(why).slice(0, 200)}` : ''}` }
}
