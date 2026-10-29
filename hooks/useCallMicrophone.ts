'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type MicrophoneStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error'

/** Local capture only. No call signaling or audio transmission. */
export function useCallMicrophone() {
  const [status, setStatus] = useState<MicrophoneStatus>('idle')
  const [muted, setMuted] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const requestId = useRef(0)

  const stop = useCallback(() => {
    requestId.current += 1
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setStatus('idle')
    setMuted(false)
  }, [])

  const start = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return null
    }
    if (streamRef.current?.getAudioTracks().some(track => track.readyState === 'live')) return streamRef.current
    const id = ++requestId.current
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      if (id !== requestId.current) {
        stream.getTracks().forEach(track => track.stop())
        return null
      }
      streamRef.current = stream
      setMuted(false)
      setStatus('ready')
      return stream
    } catch (error) {
      if (id !== requestId.current) return null
      const name = error instanceof Error ? error.name : ''
      setStatus(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error')
      return null
    }
  }, [])

  const setMicrophoneMuted = useCallback((value: boolean) => {
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !value })
    setMuted(value)
  }, [])

  useEffect(() => () => {
    requestId.current += 1
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  return { status, muted, start, stop, setMicrophoneMuted, getStream: () => streamRef.current }
}
