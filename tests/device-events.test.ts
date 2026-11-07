import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendFromUI = vi.fn(async (_options: any) => ({}))
vi.mock('@/lib/message-send', () => ({ sendFromUI: (o: any) => sendFromUI(o) }))
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => (id === 'lola-id' ? { id, name: 'pas-lola' } : id === 'exp-id' ? { id, name: 'pas-exp', experiments: { speakingSide: true } } : null) }))

const { deliverDeviceEvent } = await import('@/lib/device-events')
const idOf = (address: string) => (address === 'lola@x' ? 'lola-id' : undefined)
let n = 0
const event = (extra = {}) => ({ id: `e${++n}`, type: 'device.input', agent: 'lola@x', deviceKey: 'WCKlMemnV7JtD6Yln67o', name: 'MacBook', text: 'Hello', ...extra })

beforeEach(() => sendFromUI.mockClear())

describe('device events reach the agent', () => {
  it('a person at a device: an unverified sender, named after the device, never after a person', async () => {
    await deliverDeviceEvent(event(), idOf)
    const options = sendFromUI.mock.calls[0][0]
    expect(options).toMatchObject({ to: 'lola-id', toAlias: 'pas-lola', fromVerified: false, fromAlias: 'Device MacBook' })
    expect(options.content.message).toContain('Hello')
    expect(options.content.message).toContain('answer first with adp-device.sh say "MacBook"')
  })

  it('a retried event is delivered once', async () => {
    const once = event()
    await deliverDeviceEvent(once, idOf)
    await deliverDeviceEvent(once, idOf)
    expect(sendFromUI).toHaveBeenCalledTimes(1)
  })

  it('a failed delivery can be retried: the SDK keeps the event only if this throws', async () => {
    const retry = event()
    sendFromUI.mockRejectedValueOnce(new Error('down'))
    await expect(deliverDeviceEvent(retry, idOf)).rejects.toThrow('down')
    await deliverDeviceEvent(retry, idOf)
    expect(sendFromUI).toHaveBeenCalledTimes(2)
  })

  it('an unknown agent throws, so the SDK keeps the event', async () => {
    await expect(deliverDeviceEvent(event({ agent: 'gone@x' }), idOf)).rejects.toThrow('No agent')
  })

  it('losing a device is told; a device going on or offline is not a message', async () => {
    await deliverDeviceEvent(event({ type: 'device.revoked' }), idOf)
    expect(sendFromUI.mock.calls[0][0].subject).toContain('no longer own')
    sendFromUI.mockClear()
    for (const type of ['device.online', 'device.offline', 'device.activated']) await deliverDeviceEvent(event({ type }), idOf)
    expect(sendFromUI).not.toHaveBeenCalled()
  })
})

describe('the speaking side experiment (F100)', () => {
  const g = globalThis as any
  const expOf = (address: string) => (address === 'lola@x' ? 'exp-id' : undefined)
  it('with the flag on, the speaking side takes the words and nothing goes the usual way', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle }
    await deliverDeviceEvent(event({ source: 'voice' }), expOf)
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-id' }), { deviceKey: 'WCKlMemnV7JtD6Yln67o', deviceName: 'MacBook', text: 'Hello', source: 'voice' })
    expect(sendFromUI).not.toHaveBeenCalled()
    delete g._speakingSides
  })
  it('when the speaking side cannot take them, the words go the usual way', async () => {
    g._speakingSides = { handle: () => false }
    await deliverDeviceEvent(event(), expOf)
    expect(sendFromUI).toHaveBeenCalledTimes(1)
    delete g._speakingSides
  })
  it('with the flag off, the speaking side is never asked', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle }
    await deliverDeviceEvent(event(), idOf)
    expect(handle).not.toHaveBeenCalled()
    expect(sendFromUI).toHaveBeenCalledTimes(1)
    delete g._speakingSides
  })
})
