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
