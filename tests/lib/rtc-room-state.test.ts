import { describe, expect, it } from 'vitest'
import { applyRoomEvent, type RoomSnapshot } from '@/lib/rtc/room-state'
const initial = (): RoomSnapshot => ({ roomId: 'room-1', revision: 0, state: 'open', members: [
  { principalId: 'human-1', sessionId: 'host', role: 'host', muted: false },
  { principalId: 'human-2', sessionId: 'guest', role: 'member', muted: false },
] })
describe('RTC room membership', () => {
  it('admits agents and humans with moderator authorization', () => {
    const r = applyRoomEvent(initial(), { type: 'join', member: { principalId: 'lola', sessionId: 'agent', role: 'agent', muted: false } }, 'host')
    expect(r.ok && r.room.members.length).toBe(3)
  })
  it('blocks guest from admitting an agent', () => {
    expect(applyRoomEvent(initial(), { type: 'join', member: { principalId: 'lola', sessionId: 'agent', role: 'agent', muted: false } }, 'guest')).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('never permits remote unmute', () => {
    expect(applyRoomEvent(initial(), { type: 'mute', sessionId: 'guest', muted: false }, 'host')).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('protects the last host', () => {
    expect(applyRoomEvent(initial(), { type: 'leave', sessionId: 'host' }, 'host')).toEqual({ ok: false, reason: 'last_host' })
  })
  it('allows host to end meeting and clear membership', () => {
    const r = applyRoomEvent(initial(), { type: 'close' }, 'host')
    expect(r.ok && r.room.state).toBe('closed')
    expect(r.ok && r.room.members).toEqual([])
  })
})
