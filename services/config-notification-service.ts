/**
 * Config Notification Service
 *
 * Sends notifications when configure-agent governance requests are resolved.
 * Uses AMP messaging for agent-to-agent notifications and tmux for push notifications.
 */

import type { GovernanceRequest } from '@/types/governance-request'
import { getAgent } from '@/lib/agent-registry'

const LOG_PREFIX = '[config-notify]'

type ConfigOutcome = 'approved' | 'rejected'

/**
 * Notify the requesting agent about a configure-agent request outcome.
 *
 * For agent-initiated requests: sends AMP message to the requesting agent.
 * For all requests: logs the outcome for audit purposes.
 */
export async function notifyConfigRequestOutcome(
  request: GovernanceRequest,
  outcome: ConfigOutcome
): Promise<void> {
  if (request.type !== 'configure-agent') return

  const requestingAgent = getAgent(request.requestedBy)
  const targetAgent = getAgent(request.payload.agentId)
  const operation = request.payload.configuration?.operation || 'configure'
  const targetName = targetAgent?.name || request.payload.agentId
  const requesterName = requestingAgent?.name || request.requestedBy

  const subject = outcome === 'approved'
    ? `Config approved: ${operation} on ${targetName}`
    : `Config refused: ${operation} on ${targetName}`

  const body = outcome === 'approved'
    ? `Your configuration request (${operation}) for agent "${targetName}" has been approved and executed.\nRequest ID: ${request.id}`
    : `Your configuration request (${operation}) for agent "${targetName}" was rejected.\nRequest ID: ${request.id}\nReason: ${request.rejectReason || 'No reason provided'}`

  // Send AMP message to requesting agent if they have a session
  if (requestingAgent?.sessions && requestingAgent.sessions.length > 0) {
    try {
      const sessionName = requestingAgent.name || requestingAgent.sessions[0]?.name
      if (sessionName) {
        await sendAmpNotification(sessionName, subject, body)
        console.log(`${LOG_PREFIX} Sent ${outcome} notification to ${requesterName} (${sessionName})`)
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to send AMP notification to ${requesterName}: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Send tmux push notification if agent has an active session
  try {
    await sendTmuxNotification(requestingAgent?.name || request.requestedBy, subject)
  } catch {
    // Tmux notification is best-effort
  }

  console.log(`${LOG_PREFIX} Config request ${request.id} ${outcome}: ${operation} on ${targetName} (requested by ${requesterName})`)
}

/**
 * Send an AMP message notification.
 * Uses the internal message queue rather than shelling out to amp-send.sh.
 */
async function sendAmpNotification(
  toSessionName: string,
  subject: string,
  message: string
): Promise<void> {
  // Use the internal messaging API
  const res = await fetch('http://localhost:23000/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toSessionName,
      subject,
      priority: 'high',
      content: {
        type: 'notification',
        message,
      }
    })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
}

/**
 * Send a tmux push notification (bell/display-message).
 */
async function sendTmuxNotification(
  sessionName: string,
  message: string
): Promise<void> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)

  // Truncate message for tmux display
  const truncated = message.length > 100 ? message.substring(0, 97) + '...' : message
  const escaped = truncated.replace(/"/g, '\\"')

  try {
    await execAsync(`tmux display-message -t "${sessionName}" "[GOVERNANCE] ${escaped}"`, { timeout: 5000 })
  } catch {
    // Session may not exist or tmux not running -- silently ignore
  }
}
