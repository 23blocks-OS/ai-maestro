// TTS (Text-to-Speech) types for Companion Mode

export type TTSProviderType = 'web-speech' | 'openai' | 'elevenlabs'

export interface TTSVoice {
  id: string
  name: string
  lang: string
  provider: TTSProviderType
}

export interface TTSConfig {
  enabled: boolean
  muted: boolean
  provider: TTSProviderType
  voiceId: string | null
  rate: number    // 0.5 - 2.0, default 1.0
  pitch: number   // 0.0 - 2.0, default 1.0
  volume: number  // 0.0 - 1.0, default 0.8
  openaiApiKey?: string
  elevenLabsApiKey?: string
}

export interface TTSSpeakOptions {
  text: string
  voice?: TTSVoice
  rate?: number
  pitch?: number
  volume?: number
}

export interface TTSProvider {
  readonly type: TTSProviderType
  getVoices(): Promise<TTSVoice[]>
  speak(options: TTSSpeakOptions): Promise<void>
  stop(): void
  isSpeaking(): boolean
  /**
   * The <audio> element currently playing, when this provider renders to one.
   *
   * This is what makes real lip-sync possible: an element can be routed through
   * a Web Audio AnalyserNode, so the mouth is driven by the actual waveform
   * rather than by a boolean and Math.random().
   *
   * Optional because `web-speech` genuinely cannot supply it. SpeechSynthesis
   * renders straight to the output device and exposes no stream — there is no
   * element, no MediaStream, and no way to tap the audio. Callers must treat
   * its absence as "no analysis possible" and fall back, not as an error.
   */
  getAudioElement?(): HTMLAudioElement | null
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  enabled: true,
  muted: false,
  provider: 'web-speech',
  voiceId: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 0.8,
}
