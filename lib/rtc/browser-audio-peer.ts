'use client'

/**
 * Browser WebRTC audio transport. Requires a trusted authenticated signaling
 * implementation to exchange offers, answers and ICE candidates.
 * This module never mints room credentials or claims a call is connected.
 */
export type WebRTCSignal =
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit }

export class BrowserAudioPeer {
  private peer: RTCPeerConnection
  private local: MediaStream | null = null
  private remote = new MediaStream()

  constructor(
    config: RTCConfiguration,
    private readonly sendSignal: (signal: WebRTCSignal) => Promise<void>,
    private readonly onState: (state: RTCPeerConnectionState) => void,
    private readonly onRemoteStream: (stream: MediaStream) => void,
  ) {
    this.peer = new RTCPeerConnection(config)
    this.peer.onicecandidate = event => {
      if (event.candidate) void this.sendSignal({ kind: 'candidate', candidate: event.candidate.toJSON() })
    }
    this.peer.onconnectionstatechange = () => this.onState(this.peer.connectionState)
    this.peer.ontrack = event => {
      this.remote.addTrack(event.track)
      this.onRemoteStream(this.remote)
    }
  }

  attachMicrophone(stream: MediaStream): void {
    if (this.local) throw new Error('Microphone already attached')
    this.local = stream
    stream.getAudioTracks().forEach(track => this.peer.addTrack(track, stream))
  }

  async offer(): Promise<void> {
    await this.peer.setLocalDescription(await this.peer.createOffer())
    if (this.peer.localDescription) {
      await this.sendSignal({ kind: 'description', description: this.peer.localDescription.toJSON() })
    }
  }

  async receive(signal: WebRTCSignal): Promise<void> {
    if (signal.kind === 'candidate') {
      await this.peer.addIceCandidate(signal.candidate)
      return
    }
    await this.peer.setRemoteDescription(signal.description)
    if (signal.description.type === 'offer') {
      await this.peer.setLocalDescription(await this.peer.createAnswer())
      if (this.peer.localDescription) {
        await this.sendSignal({ kind: 'description', description: this.peer.localDescription.toJSON() })
      }
    }
  }

  close(): void {
    this.peer.close()
    this.local?.getTracks().forEach(track => track.stop())
    this.local = null
    this.remote.getTracks().forEach(track => track.stop())
  }
}
