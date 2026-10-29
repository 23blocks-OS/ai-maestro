/** iOS PushKit/CallKit adapter boundary; not a native iOS implementation. */
export type MobileDevice = { deviceId: string; principalId: string; platform: 'ios' | 'android'; enrolledAt: string; revokedAt?: string }
export type IncomingCallNotice = { callId: string; callerDisplayName: string; expiresAt: string }
export type NativeCallAction = { callId: string; deviceId: string; action: 'answer' | 'decline' | 'end' }
export interface NativeCallBridge {
  registerDevice(device: MobileDevice, attestation: string): Promise<void>
  notifyIncomingCall(deviceId: string, notice: IncomingCallNotice): Promise<void>
  endIncomingCall(deviceId: string, callId: string): Promise<void>
  /** Native answer must be authenticated before server-side acceptance. */
  handleAction(action: NativeCallAction, authenticatedPrincipalId: string): Promise<void>
}
