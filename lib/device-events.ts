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
  source?: string
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
  // F103: the operator marked this device as one person's, so its input is theirs. Only the operator sets it
  const person = input ? agent.devicePeople?.[event.deviceKey]?.name : undefined

  // Experiment F100: the agent's speaking side answers. When it cannot, the words go the usual way below
  const speaking = (globalThis as { _speakingSides?: { handle(a: unknown, e: unknown): boolean } })._speakingSides
  if (input && agent.experiments?.speakingSide && speaking?.handle(agent, { deviceKey: event.deviceKey, deviceName: device, text: event.text, source: event.source, person })) {
    seen.add(event.id)
    return
  }
  await sendFromUI({
    from: `device-${event.deviceKey.slice(0, 8)}`,
    fromAlias: person ? `${person} at ${device}` : `Device ${device}`,
    to: agent.id,
    toAlias: agent.name,
    subject: input ? (person ? `${person} at your device ${device}` : `Someone at your device ${device}`) : `You no longer own the device ${device}`,
    content: {
      type: input ? 'request' : 'notification',
      message: input
        ? `${event.text}\n\n(${event.source === 'voice' ? 'Said' : 'Typed'}${person ? ` by ${person}` : ''} at your device "${device}"${person ? `, which the operator marked as ${person}'s` : ''}${event.source === 'voice' ? ', transcribed, so it may contain errors' : ''}. This is the whole message: a person is waiting, so answer first with adp-device.sh say "${device}" "...", then mark it read with amp-read.sh.)`
        : `The device "${device}" no longer accepts you as its owner.`,
      context: { device: event.deviceKey, source: 'device' },
    },
    priority: 'normal',
    fromVerified: !!person,
  } as Parameters<typeof sendFromUI>[0])

  seen.add(event.id)
  if (seen.size > REMEMBERED) seen.delete(seen.values().next().value as string)
}
