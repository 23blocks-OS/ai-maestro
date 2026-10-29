/** Room membership is separate from one-to-one call lifecycle. */
export type RoomRole = 'host' | 'moderator' | 'member' | 'agent'
export type RoomState = 'open' | 'closing' | 'closed'
export type RoomParticipant = { principalId: string; principalKind: 'human' | 'agent'; sessionId: string; role: RoomRole; muted: boolean; joinedAt: string }
export type Room = { roomId: string; ownerProvider: string; state: RoomState; revision: number; participants: readonly RoomParticipant[] }
export type RoomAction =
  | { kind: 'join'; roomId: string; sessionId: string; invitationId: string }
  | { kind: 'leave'; roomId: string; sessionId: string }
  | { kind: 'mute'; roomId: string; targetSessionId: string; muted: boolean }
  | { kind: 'remove'; roomId: string; targetSessionId: string }
  | { kind: 'end'; roomId: string }
export type RoomResult = { ok: true; room: Room } | { ok: false; code: 'unauthorized' | 'not_found' | 'closed' | 'invalid_invite' | 'conflict' }
export interface RoomCoordinator {
  get(roomId: string, actorPrincipalId: string): Promise<RoomResult>
  execute(action: RoomAction, actorPrincipalId: string): Promise<RoomResult>
  /** Must be atomic across processes and nodes. */
  compareAndSwap(roomId: string, expectedRevision: number, next: Room): Promise<boolean>
}
