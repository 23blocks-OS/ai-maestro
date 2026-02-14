/**
 * Voice Commands - Client-side interception of natural language commands
 * for the companion voice interface (repeat, mute, volume, speed, etc.)
 *
 * Detected BEFORE sending to the agent, so meta-commands about the voice
 * interface don't waste agent time.
 */

export interface VoiceCommand {
  id: string
  action: string
  keywords: string[]
  phrases: string[]
  description: string
  feedbackMessage: string
}

export interface VoiceCommandMatch {
  command: VoiceCommand
  confidence: 'exact' | 'high'
}

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    id: 'repeat',
    action: 'repeat',
    keywords: ['repeat'],
    phrases: ['say again', 'come again', 'say that again', 'what did you say', 'pardon me', 'one more time'],
    description: 'Repeat the last spoken message',
    feedbackMessage: 'Repeating...',
  },
  {
    id: 'stop',
    action: 'stop',
    keywords: ['stop', 'silence', 'hush'],
    phrases: ['stop talking', 'be quiet', 'stop speaking', 'shut up'],
    description: 'Stop current speech',
    feedbackMessage: 'Stopped',
  },
  {
    id: 'mute',
    action: 'mute',
    keywords: ['mute'],
    phrases: ['mute voice', 'go silent'],
    description: 'Mute voice output',
    feedbackMessage: 'Muted',
  },
  {
    id: 'unmute',
    action: 'unmute',
    keywords: ['unmute'],
    phrases: ['unmute voice', 'start talking', 'voice on'],
    description: 'Unmute voice output',
    feedbackMessage: 'Unmuted',
  },
  {
    id: 'louder',
    action: 'louder',
    keywords: ['louder'],
    phrases: ['volume up', 'speak louder', 'turn up'],
    description: 'Increase volume',
    feedbackMessage: 'Volume up',
  },
  {
    id: 'quieter',
    action: 'quieter',
    keywords: ['quieter', 'softer'],
    phrases: ['volume down', 'speak softer', 'turn down'],
    description: 'Decrease volume',
    feedbackMessage: 'Volume down',
  },
  {
    id: 'faster',
    action: 'faster',
    keywords: ['faster'],
    phrases: ['speed up', 'speak faster', 'talk faster'],
    description: 'Increase speech rate',
    feedbackMessage: 'Faster',
  },
  {
    id: 'slower',
    action: 'slower',
    keywords: ['slower'],
    phrases: ['slow down', 'speak slower', 'talk slower'],
    description: 'Decrease speech rate',
    feedbackMessage: 'Slower',
  },
]

/**
 * Normalize input for matching: lowercase, strip punctuation, collapse whitespace
 */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Match user input against voice commands.
 * Returns a match if the input is a voice command, null otherwise.
 *
 * Strategy:
 * 1. Short-circuit if input > 60 chars (too long to be a command)
 * 2. Check phrases first (multi-word substrings) -> 'exact' confidence
 * 3. Check keywords only if input <= 8 words -> 'high' confidence
 */
export function matchVoiceCommand(input: string): VoiceCommandMatch | null {
  const normalized = normalize(input)

  // Short-circuit: too long to be a command
  if (normalized.length > 60) return null
  if (normalized.length === 0) return null

  // Check phrases first (multi-word matches)
  for (const command of VOICE_COMMANDS) {
    for (const phrase of command.phrases) {
      if (normalized === phrase || normalized === `please ${phrase}`) {
        return { command, confidence: 'exact' }
      }
    }
  }

  // Check keywords only if input is short (<=8 words)
  const wordCount = normalized.split(' ').length
  if (wordCount <= 8) {
    for (const command of VOICE_COMMANDS) {
      for (const keyword of command.keywords) {
        if (normalized === keyword || normalized === `please ${keyword}`) {
          return { command, confidence: 'high' }
        }
      }
    }
  }

  return null
}
