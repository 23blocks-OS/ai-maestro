/** Provider-neutral WebRTC media interfaces. No implementation or vendor dependency. */
export type MediaParticipant = { principalId: string; sessionId: string; role: 'human' | 'agent' }
export type MediaState = 'new' | 'negotiating' | 'connected' | 'reconnecting' | 'disconnected' | 'failed' | 'closed'
export type MediaGrant = { reference: string; expiresAt: string; callId?: string; roomId?: string }
export interface AudioMediaAdapter {
  createCall(callId: string, participants: readonly MediaParticipant[]): Promise<void>
  createRoom(roomId: string): Promise<void>
  issueJoinGrant(scope: { callId?: string; roomId?: string }, participant: MediaParticipant): Promise<MediaGrant>
  revokeJoinGrant(reference: string): Promise<void>
  close(scope: { callId?: string; roomId?: string }): Promise<void>
}
export interface AgentVoiceAdapter {
  start(input: { agentId: string; mediaGrant: MediaGrant; sessionId: string }): Promise<void>
  interrupt(sessionId: string): Promise<void>
  stop(sessionId: string): Promise<void>
}
export interface VoiceSessionEvents {
  onStateChange(sessionId: string, state: MediaState): void
  onSpeechStart(sessionId: string, principalId: string): void
  onSpeechEnd(sessionId: string, principalId: string): void
}
