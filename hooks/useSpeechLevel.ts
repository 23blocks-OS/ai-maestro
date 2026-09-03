'use client'

import { useCallback, useEffect, useRef } from 'react'
import { levelFromRms, rms, syntheticLevel, type SpeechLevelMode } from '@/lib/speech-level'

interface UseSpeechLevelOptions {
  /** Whether the agent is speaking right now. */
  isSpeaking: boolean
  /**
   * Returns the element currently playing, if the TTS provider renders to one.
   * `web-speech` cannot, and returns null — see lib/speech-level.
   */
  getAudioElement?: () => HTMLAudioElement | null
}

export interface SpeechLevelReader {
  /** Current 0..1 speech energy. Read from a rAF loop, never from render. */
  read: () => number
  /** Where the current level comes from. */
  mode: () => SpeechLevelMode
}

/**
 * Speech energy for driving a face, sampled imperatively.
 *
 * Deliberately NOT React state. This is read 60 times a second; putting it in
 * state would re-render the tree on every frame and make the animation the most
 * expensive thing on the page. The renderer pulls from a ref instead.
 *
 * Web Audio notes that cost time to learn and are easy to get wrong:
 *
 *   - `createMediaElementSource` may be called ONCE per element, and it
 *     re-routes that element's output through the graph. Forgetting to connect
 *     onward to `destination` silences the audio entirely — the mouth moves and
 *     nothing is heard.
 *   - Each utterance builds a fresh `new Audio(blobUrl)`, so a new source node
 *     per element is correct; a WeakSet guards against wiring one twice if the
 *     same element is ever reused.
 *   - An AudioContext starts suspended until a user gesture. A call has one by
 *     definition (the user tapped to call), so resume() on first use.
 */
export function useSpeechLevel({ isSpeaking, getAudioElement }: UseSpeechLevelOptions): SpeechLevelReader {
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  // Typed as Float32Array<ArrayBuffer> because getFloatTimeDomainData rejects
  // the ArrayBufferLike default (it could be a SharedArrayBuffer).
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const wiredRef = useRef<WeakSet<HTMLAudioElement>>(new WeakSet())
  const currentElementRef = useRef<HTMLAudioElement | null>(null)
  const modeRef = useRef<SpeechLevelMode>('silent')
  const startedAtRef = useRef<number>(0)
  const speakingRef = useRef(isSpeaking)

  speakingRef.current = isSpeaking

  useEffect(() => {
    if (isSpeaking) startedAtRef.current = performance.now()
  }, [isSpeaking])

  const ensureAnalyser = useCallback((el: HTMLAudioElement) => {
    if (currentElementRef.current === el && analyserRef.current) return true
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      if (!ctxRef.current) ctxRef.current = new Ctor()
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') void ctx.resume()

      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser()
        // 1024 is the smallest window that still gives a steady RMS at speech
        // rates; smaller and the level jitters per frame, larger and the mouth
        // lags the voice noticeably.
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.2
        analyserRef.current = analyser
        bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))
        analyser.connect(ctx.destination)
      }

      if (!wiredRef.current.has(el)) {
        const source = ctx.createMediaElementSource(el)
        // Through the analyser and onward. Skipping this connection is the
        // classic mistake: perfect animation, total silence.
        source.connect(analyserRef.current!)
        wiredRef.current.add(el)
      }
      currentElementRef.current = el
      return true
    } catch {
      // Any failure here (autoplay policy, cross-origin element, unsupported
      // browser) falls back to synthetic rather than killing the face.
      return false
    }
  }, [])

  const read = useCallback((): number => {
    if (!speakingRef.current) {
      modeRef.current = 'silent'
      return 0
    }

    const el = getAudioElement?.() ?? null
    if (el && ensureAnalyser(el) && analyserRef.current && bufferRef.current) {
      analyserRef.current.getFloatTimeDomainData(bufferRef.current)
      modeRef.current = 'analysed'
      return levelFromRms(rms(bufferRef.current))
    }

    // No element to tap — the provider renders straight to the device.
    modeRef.current = 'synthetic'
    return syntheticLevel((performance.now() - startedAtRef.current) / 1000)
  }, [getAudioElement, ensureAnalyser])

  const mode = useCallback(() => modeRef.current, [])

  useEffect(() => {
    return () => {
      // Close the context on unmount. Browsers cap the number of live
      // AudioContexts, and a call screen that is opened and closed repeatedly
      // will hit that ceiling and then fail silently.
      const ctx = ctxRef.current
      ctxRef.current = null
      analyserRef.current = null
      bufferRef.current = null
      currentElementRef.current = null
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
    }
  }, [])

  return { read, mode }
}
