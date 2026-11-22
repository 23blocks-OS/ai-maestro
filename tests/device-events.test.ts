import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendFromUI = vi.fn(async (_options: any) => ({}))
vi.mock('@/lib/message-send', () => ({ sendFromUI: (o: any) => sendFromUI(o) }))
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => (id === 'lola-id' ? { id, name: 'pas-lola' } : id === 'exp-id' ? { id, name: 'pas-exp', experiments: { speakingSide: true }, devicePeople: { PHONEKEY0123456789ab: { personId: 'p1', name: 'Juan' } } } : null) }))

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

  it('words relayed by Siri tell the agent its first reply is read aloud and the talk ends', async () => {
    await deliverDeviceEvent(event({ via: 'siri' }), idOf)
    const message = sendFromUI.mock.calls[0][0].content.message
    expect(message).toContain('It came through Siri, which reads your first reply aloud')
    sendFromUI.mockClear()
    await deliverDeviceEvent(event(), idOf)
    expect(sendFromUI.mock.calls[0][0].content.message).not.toContain('came through')
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

describe('a device that speaks for a person (F103)', () => {
  const g = globalThis as any
  const expOf = (address: string) => (address === 'lola@x' ? 'exp-id' : undefined)
  it('its words reach the agent as that person, verified', async () => {
    await deliverDeviceEvent(event({ deviceKey: 'PHONEKEY0123456789ab', name: 'iPhone' }), expOf)
    const options = sendFromUI.mock.calls[0][0]
    expect(options).toMatchObject({ fromVerified: true, fromAlias: 'Juan at iPhone', subject: 'Juan at your device iPhone' })
    expect(options.content.message).toContain("which the operator marked as Juan's")
  })
  it('the cerebellum is told who it is', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle, handleReady: async (...a: unknown[]) => (handle as (...x: unknown[]) => unknown)(...a) }
    await deliverDeviceEvent(event({ deviceKey: 'PHONEKEY0123456789ab', name: 'iPhone' }), expOf)
    expect(handle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ person: 'Juan' }))
    delete g._speakingSides
  })
  it('another device of the same agent stays unverified', async () => {
    await deliverDeviceEvent(event(), expOf)
    expect(sendFromUI.mock.calls[0][0]).toMatchObject({ fromVerified: false, fromAlias: 'Device MacBook' })
  })
})

describe('the speaking side experiment (F100)', () => {
  const g = globalThis as any
  const expOf = (address: string) => (address === 'lola@x' ? 'exp-id' : undefined)
  it('with the flag on, the speaking side takes the words and nothing goes the usual way', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle, handleReady: async (...a: unknown[]) => (handle as (...x: unknown[]) => unknown)(...a) }
    await deliverDeviceEvent(event({ source: 'voice' }), expOf)
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-id' }), { deviceKey: 'WCKlMemnV7JtD6Yln67o', deviceName: 'MacBook', text: 'Hello', source: 'voice', person: undefined, fallback: expect.any(Function) })
    expect(sendFromUI).not.toHaveBeenCalled()
    // Its turn failed before it said anything: the same words go the usual way
    const turn = (handle.mock.calls[0] as unknown[])[1] as { fallback: () => Promise<unknown> }
    await turn.fallback()
    expect(sendFromUI).toHaveBeenCalledOnce()
    delete g._speakingSides
  })
  it('when the speaking side cannot take them, the words go the usual way', async () => {
    g._speakingSides = { handle: () => false, handleReady: async () => false }
    await deliverDeviceEvent(event(), expOf)
    expect(sendFromUI).toHaveBeenCalledTimes(1)
    delete g._speakingSides
  })
  it('with the flag off, the speaking side is never asked', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle, handleReady: async (...a: unknown[]) => (handle as (...x: unknown[]) => unknown)(...a) }
    await deliverDeviceEvent(event(), idOf)
    expect(handle).not.toHaveBeenCalled()
    expect(sendFromUI).toHaveBeenCalledTimes(1)
    delete g._speakingSides
  })
})

describe('who the voice sounds like (#78)', () => {
  const g = globalThis as any
  const expOf = (address: string) => (address === 'lola@x' ? 'exp-id' : undefined)
  const phone = { deviceKey: 'PHONEKEY0123456789ab', name: 'iPhone', source: 'voice' }
  it('a voice match alone never verifies the sender', async () => {
    await deliverDeviceEvent(event({ source: 'voice', speaker: { id: 'p2', name: 'Alice', confidence: 0.82 } }), idOf)
    const options = sendFromUI.mock.calls[0][0]
    expect(options).toMatchObject({ fromVerified: false, fromAlias: 'Device MacBook', subject: 'Someone at your device MacBook' })
    expect(options.content.message).toContain('The voice sounds like Alice (82% match; a voice match is a guess, not proof).')
  })
  it('a voice that names someone else: both are shown, neither is verified', async () => {
    await deliverDeviceEvent(event({ ...phone, speaker: { id: 'p2', name: 'Alice', confidence: 0.9 } }), expOf)
    const options = sendFromUI.mock.calls[0][0]
    expect(options).toMatchObject({ fromVerified: false, fromAlias: 'Device iPhone', subject: 'Someone at your device iPhone' })
    expect(options.content.message).toContain("The operator marked this device as Juan's, but the voice does not match")
  })
  it('a voice that matches the device person keeps it verified', async () => {
    await deliverDeviceEvent(event({ ...phone, speaker: { id: 'p1', name: 'Juan', confidence: 0.9 } }), expOf)
    expect(sendFromUI.mock.calls[0][0]).toMatchObject({ fromVerified: true, fromAlias: 'Juan at iPhone' })
  })
  it('a speaker on typed input is ignored', async () => {
    await deliverDeviceEvent(event({ source: 'device', speaker: { id: 'p2', name: 'Alice', confidence: 0.9 } }), idOf)
    expect(sendFromUI.mock.calls[0][0].content.message).not.toContain('Alice')
  })
  it('the speaking side gets the note and no person when they disagree', async () => {
    const handle = vi.fn(() => true)
    g._speakingSides = { handle, handleReady: async (...a: unknown[]) => (handle as (...x: unknown[]) => unknown)(...a) }
    await deliverDeviceEvent(event({ ...phone, speaker: { id: 'p2', name: 'Alice', confidence: 0.9 } }), expOf)
    expect(handle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ person: undefined, note: expect.stringContaining('sounds like Alice') }))
    delete g._speakingSides
  })
})
