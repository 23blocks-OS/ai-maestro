import type { TTSProvider, TTSVoice, TTSSpeakOptions } from '@/types/tts'

// --- ANSI stripping ---

// Matches all ANSI escape sequences (CSI, OSC, DCS, etc.)
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g

// Matches common terminal noise patterns
const NOISE_PATTERNS = [
  /[─━═│┃┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╰╯]+/g,    // Box drawing characters
  /[░▒▓█▄▀■□▪▫●○◆◇▶▷◀◁▲△▼▽]+/g,          // Block/shape elements
  /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣷⣯⣟⡿⢿⣻⣽]+/g,              // Braille spinners
  /\[[\d;]*[KJHfm]/g,                      // Remaining CSI sequences
  /\r/g,                                    // Carriage returns
  /\x07/g,                                  // Bell character
  /\t/g,                                    // Tabs (replace later with space)
]

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

export function summarizeTerminalOutput(raw: string, maxLength: number = 300): string {
  let text = stripAnsi(raw)

  // Remove noise patterns
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ')
  }

  // Remove common progress bar patterns: [=====>    ] 45%
  text = text.replace(/\[[\s=>#-]+\]\s*\d+%/g, '')

  // Remove percentage indicators on their own line
  text = text.replace(/^\s*\d{1,3}%\s*$/gm, '')

  // Remove empty lines and collapse whitespace
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Take the last maxLength characters (the most recent/relevant output)
  if (text.length > maxLength) {
    // Try to break at a word boundary
    const truncated = text.slice(-maxLength)
    const firstSpace = truncated.indexOf(' ')
    if (firstSpace > 0 && firstSpace < 50) {
      return truncated.slice(firstSpace + 1)
    }
    return truncated
  }

  return text
}

// --- Web Speech API Provider ---

// Chrome has a ~15s limit per utterance; chunk long text
const CHUNK_MAX_CHARS = 180

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_MAX_CHARS) {
      chunks.push(remaining)
      break
    }

    // Find a good break point (sentence end, comma, space)
    let breakAt = -1
    const searchWindow = remaining.slice(0, CHUNK_MAX_CHARS)

    // Prefer sentence boundaries
    const sentenceEnd = Math.max(
      searchWindow.lastIndexOf('. '),
      searchWindow.lastIndexOf('! '),
      searchWindow.lastIndexOf('? ')
    )
    if (sentenceEnd > CHUNK_MAX_CHARS * 0.4) {
      breakAt = sentenceEnd + 2
    }

    // Fall back to comma
    if (breakAt === -1) {
      const comma = searchWindow.lastIndexOf(', ')
      if (comma > CHUNK_MAX_CHARS * 0.4) {
        breakAt = comma + 2
      }
    }

    // Fall back to space
    if (breakAt === -1) {
      const space = searchWindow.lastIndexOf(' ')
      if (space > CHUNK_MAX_CHARS * 0.3) {
        breakAt = space + 1
      }
    }

    // Hard break as last resort
    if (breakAt === -1) {
      breakAt = CHUNK_MAX_CHARS
    }

    chunks.push(remaining.slice(0, breakAt).trim())
    remaining = remaining.slice(breakAt).trim()
  }

  return chunks
}

function getWebSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }
    // Chrome loads voices asynchronously
    const handler = () => {
      speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(speechSynthesis.getVoices())
    }
    speechSynthesis.addEventListener('voiceschanged', handler)
    // Fallback timeout in case event never fires
    setTimeout(() => {
      speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(speechSynthesis.getVoices())
    }, 2000)
  })
}

export function createWebSpeechProvider(): TTSProvider {
  let speaking = false

  return {
    type: 'web-speech',

    async getVoices(): Promise<TTSVoice[]> {
      if (typeof window === 'undefined' || !window.speechSynthesis) return []
      const nativeVoices = await getWebSpeechVoices()
      return nativeVoices.map((v) => ({
        id: v.voiceURI,
        name: v.name,
        lang: v.lang,
        provider: 'web-speech' as const,
      }))
    },

    async speak(options: TTSSpeakOptions): Promise<void> {
      if (typeof window === 'undefined' || !window.speechSynthesis) return

      // Stop any current speech
      speechSynthesis.cancel()

      const chunks = chunkText(options.text)
      const nativeVoices = await getWebSpeechVoices()
      const selectedVoice = options.voice
        ? nativeVoices.find((v) => v.voiceURI === options.voice!.id) || null
        : null

      speaking = true

      for (let i = 0; i < chunks.length; i++) {
        if (!speaking) break

        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(chunks[i])
          if (selectedVoice) utterance.voice = selectedVoice
          if (options.rate != null) utterance.rate = options.rate
          if (options.pitch != null) utterance.pitch = options.pitch
          if (options.volume != null) utterance.volume = options.volume

          utterance.onend = () => resolve()
          utterance.onerror = (e) => {
            // 'canceled' is not a real error
            if (e.error === 'canceled') resolve()
            else reject(e)
          }

          speechSynthesis.speak(utterance)
        })
      }

      speaking = false
    },

    stop() {
      speaking = false
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        speechSynthesis.cancel()
      }
    },

    isSpeaking() {
      return speaking
    },
  }
}

// --- OpenAI TTS Provider (Standard Tier) ---

// OpenAI preset voices
const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', desc: 'Neutral, balanced' },
  { id: 'ash', name: 'Ash', desc: 'Warm, conversational' },
  { id: 'ballad', name: 'Ballad', desc: 'Gentle, soothing' },
  { id: 'coral', name: 'Coral', desc: 'Clear, friendly' },
  { id: 'echo', name: 'Echo', desc: 'Smooth, resonant' },
  { id: 'fable', name: 'Fable', desc: 'Expressive, storytelling' },
  { id: 'nova', name: 'Nova', desc: 'Bright, energetic' },
  { id: 'onyx', name: 'Onyx', desc: 'Deep, authoritative' },
  { id: 'sage', name: 'Sage', desc: 'Calm, thoughtful' },
  { id: 'shimmer', name: 'Shimmer', desc: 'Light, animated' },
]

export function createOpenAIProvider(apiKey: string): TTSProvider {
  let audio: HTMLAudioElement | null = null
  let speaking = false

  return {
    type: 'openai',

    async getVoices(): Promise<TTSVoice[]> {
      return OPENAI_VOICES.map(v => ({
        id: v.id,
        name: `${v.name} – ${v.desc}`,
        lang: 'en',
        provider: 'openai' as const,
      }))
    },

    async speak(options: TTSSpeakOptions): Promise<void> {
      const voiceId = options.voice?.id || 'nova'
      try {
        speaking = true
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            input: options.text,
            voice: voiceId,
            response_format: 'mp3',
            instructions: 'Speak in a natural, conversational tone. You are a colleague giving a quick verbal update about coding work.',
          }),
        })
        if (!res.ok) {
          console.error(`[OpenAI TTS] Error: ${res.status} ${res.statusText}`)
          speaking = false
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        audio = new Audio(url)
        if (options.volume != null) audio.volume = options.volume
        // OpenAI TTS doesn't support rate/pitch directly, but we can use playbackRate
        if (options.rate != null) audio.playbackRate = options.rate

        await new Promise<void>((resolve) => {
          audio!.onended = () => {
            speaking = false
            URL.revokeObjectURL(url)
            resolve()
          }
          audio!.onerror = () => {
            speaking = false
            URL.revokeObjectURL(url)
            resolve()
          }
          audio!.play()
        })
      } catch {
        speaking = false
      }
    },

    stop() {
      speaking = false
      if (audio) {
        audio.pause()
        audio.currentTime = 0
        audio = null
      }
    },

    isSpeaking() {
      return speaking
    },
  }
}

// --- ElevenLabs Provider (Premium Tier) ---

export function createElevenLabsProvider(apiKey: string): TTSProvider {
  let audio: HTMLAudioElement | null = null
  let speaking = false

  return {
    type: 'elevenlabs',

    async getVoices(): Promise<TTSVoice[]> {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': apiKey },
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.voices || []).map((v: { voice_id: string; name: string }) => ({
          id: v.voice_id,
          name: v.name,
          lang: 'en',
          provider: 'elevenlabs' as const,
        }))
      } catch {
        return []
      }
    },

    async speak(options: TTSSpeakOptions): Promise<void> {
      const voiceId = options.voice?.id || 'EXAVITQu4vr4xnSDxMaL' // Default: Bella
      try {
        speaking = true
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: options.text,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5,
              },
            }),
          }
        )
        if (!res.ok) {
          speaking = false
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        audio = new Audio(url)
        if (options.volume != null) audio.volume = options.volume

        await new Promise<void>((resolve) => {
          audio!.onended = () => {
            speaking = false
            URL.revokeObjectURL(url)
            resolve()
          }
          audio!.onerror = () => {
            speaking = false
            URL.revokeObjectURL(url)
            resolve()
          }
          audio!.play()
        })
      } catch {
        speaking = false
      }
    },

    stop() {
      speaking = false
      if (audio) {
        audio.pause()
        audio.currentTime = 0
        audio = null
      }
    },

    isSpeaking() {
      return speaking
    },
  }
}
