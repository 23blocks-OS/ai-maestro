/**
 * What devices tell the host, turned into messages for their agents (F082). A device knows only that someone used it:
 * the text is untrusted input and never carries a person's name, so it goes as an unverified sender and arrives wrapped.
 */
import { sendFromUI } from '@/lib/message-send'
import { getAgent } from '@/lib/agent-registry'

interface DeviceEvent {
  id: string
  type: string
  agent: string
  deviceKey: string
  name?: string
  text?: string
}

/** The SDK retries a delivery that failed, and can repeat one on a restart. Enough to cover both */
const REMEMBERED = 500
const seen = new Set<string>()

export async function deliverDeviceEvent(event: DeviceEvent, agentIdOf: (address: string) => string | undefined): Promise<void> {
  if (event.type !== 'device.input' && event.type !== 'device.revoked') return
  if (seen.has(event.id)) return
  const agentId = agentIdOf(event.agent)
  const agent = agentId ? getAgent(agentId) : null
  if (!agent) throw new Error(`No agent for ${event.agent}`)

  const device = event.name || event.deviceKey.slice(0, 8)
  const input = event.type === 'device.input'
  await sendFromUI({
    from: `device-${event.deviceKey.slice(0, 8)}`,
    fromAlias: `Device ${device}`,
    to: agent.id,
    toAlias: agent.name,
    subject: input ? `Someone at your device ${device}` : `You no longer own the device ${device}`,
    content: {
      type: input ? 'request' : 'notification',
      message: input
        ? `${event.text}\n\n(Typed at your device "${device}". Answer there with: adp-device.sh say "${device}" "...")`
        : `The device "${device}" no longer accepts you as its owner.`,
      context: { device: event.deviceKey, source: 'device' },
    },
    priority: 'normal',
    fromVerified: false,
  } as Parameters<typeof sendFromUI>[0])

  seen.add(event.id)
  if (seen.size > REMEMBERED) seen.delete(seen.values().next().value as string)
}
