/** RTC coordinator contract. Interface only: no network route or auth bypass. */
export type Principal = { kind: 'human' | 'agent'; id: string; provider: string }
export type CallPhase = 'inviting' | 'ringing' | 'accepted' | 'connecting' | 'connected' | 'ended' | 'failed' | 'rejected' | 'canceled' | 'timed_out'
export type CallRecord = {
  callId: string
  caller: Principal
  callee: Principal
  phase: CallPhase
  revision: number
  expiresAt: string
  acceptedSessionId?: string
}
export type CallCommand =
  | { kind: 'invite'; idempotencyKey: string; caller: Principal; callee: Principal; expiresAt: string }
  | { kind: 'ringing' | 'accept' | 'reject' | 'cancel' | 'connect' | 'end' | 'fail'; callId: string; idempotencyKey: string; actor: Principal; deviceSessionId?: string }
export type CallOutcome = { ok: true; call: CallRecord } | { ok: false; code: 'unauthorized' | 'conflict' | 'expired' | 'not_found' | 'invalid_state' | 'unavailable' }
export interface CallCoordinator {
  /** AuthN/AuthZ occurs before invocation; implementations recheck scoped grants. */
  execute(command: CallCommand, authenticatedActor: Principal): Promise<CallOutcome>
  get(callId: string, authenticatedActor: Principal): Promise<CallOutcome>
  /** Compare-and-swap required for multi-device first-answer-wins. */
  compareAndSwap(callId: string, expectedRevision: number, next: CallRecord): Promise<boolean>
}
export interface CallEventPublisher {
  publish(call: CallRecord, eventId: string): Promise<void>
}
export interface DeviceRegistry {
  listEligibleDevices(human: Principal): Promise<readonly { sessionId: string; platform: 'ios' | 'android' | 'web' }[]>
  revoke(sessionId: string, authenticatedHuman: Principal): Promise<void>
}
