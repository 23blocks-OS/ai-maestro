/**
 * Channel bridge — deliver() side of the Channels reliable last-mile.
 *
 * The amp-channel-server (running inside each agent's Claude Code session)
 * self-registers at ~/.aimaestro/channels/<agentId>.json = { port, ... }.
 * This module reads that registry and POSTs a message into the agent's channel,
 * which injects a real turn — no tmux send-keys, works on an idle agent.
 *
 * File-based (not globalThis) because the channel server runs in a SEPARATE
 * process (the agent's CLI) from AI Maestro's server; the file is the IPC.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function channelFile(agentId) {
  return path.join(os.homedir(), '.aimaestro', 'channels', `${agentId}.json`)
}

/** @returns {{port:number, pid?:number, startedAt?:string}|null} */
export function getChannelInfo(agentId) {
  if (!agentId) return null
  try {
    const info = JSON.parse(fs.readFileSync(channelFile(agentId), 'utf8'))
    if (info && typeof info.port === 'number') return info
  } catch { /* no channel registered */ }
  return null
}

/** True if the agent currently has a registered channel. */
export function hasChannel(agentId) {
  return !!getChannelInfo(agentId)
}

/**
 * Push text into the agent's Channel MCP server → injects a turn. Returns true
 * only if the channel accepted it (HTTP 200). A stale registry (server gone)
 * fails the POST and returns false, so deliver() falls back to tmux — self-healing.
 */
export async function pushToChannel(agentId, text) {
  const info = getChannelInfo(agentId)
  if (!info) return false
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}`, {
      method: 'POST',
      body: text,
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}
