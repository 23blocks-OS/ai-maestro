/** Pure room membership state machine. Caller must authenticate and persist atomically. */
export type RoomMember = { principalId: string; sessionId: string; role: 'host' | 'moderator' | 'member' | 'agent'; muted: boolean }
export type RoomSnapshot = { roomId: string; revision: number; state: 'open' | 'closed'; members: readonly RoomMember[] }
export type RoomEvent =
  | { type: 'join'; member: RoomMember }
  | { type: 'leave'; sessionId: string }
  | { type: 'mute'; sessionId: string; muted: boolean }
  | { type: 'close' }
export type RoomTransition = { ok: true; room: RoomSnapshot } | { ok: false; reason: 'closed' | 'duplicate' | 'not_found' | 'forbidden' | 'last_host' }
export function applyRoomEvent(room: RoomSnapshot, event: RoomEvent, actorSessionId: string): RoomTransition {
  if (room.state === 'closed') return { ok: false, reason: 'closed' }
  const actor = room.members.find(m => m.sessionId === actorSessionId)
  if (!actor) return { ok: false, reason: 'forbidden' }
  const elevated = actor.role === 'host' || actor.role === 'moderator'
  let members: readonly RoomMember[] = room.members
  switch (event.type) {
    case 'join':
      // Only hosts/moderators may admit participants; invitation policy enforced upstream.
      if (!elevated) return { ok: false, reason: 'forbidden' }
      if (members.some(m => m.sessionId === event.member.sessionId)) return { ok: false, reason: 'duplicate' }
      if (event.member.role === 'host' && actor.role !== 'host') return { ok: false, reason: 'forbidden' }
      members = [...members, event.member]
      break
    case 'leave': {
      const target = members.find(m => m.sessionId === event.sessionId)
      if (!target) return { ok: false, reason: 'not_found' }
      if (target.sessionId !== actorSessionId && !elevated) return { ok: false, reason: 'forbidden' }
      if (target.role === 'host' && members.filter(m => m.role === 'host').length === 1) return { ok: false, reason: 'last_host' }
      members = members.filter(m => m.sessionId !== event.sessionId)
      break
    }
    case 'mute':
      if (!members.some(m => m.sessionId === event.sessionId)) return { ok: false, reason: 'not_found' }
      if (event.sessionId !== actorSessionId && !elevated) return { ok: false, reason: 'forbidden' }
      // Unmuting another participant remotely is never permitted.
      if (!event.muted && event.sessionId !== actorSessionId) return { ok: false, reason: 'forbidden' }
      members = members.map(m => m.sessionId === event.sessionId ? { ...m, muted: event.muted } : m)
      break
    case 'close':
      if (actor.role !== 'host') return { ok: false, reason: 'forbidden' }
      return { ok: true, room: { ...room, state: 'closed', revision: room.revision + 1, members: [] } }
  }
  return { ok: true, room: { ...room, members, revision: room.revision + 1 } }
}
