/**
 * Voice Subsystem - LLM-powered speech summarization
 *
 * Buffers terminal output, and when the agent goes idle, uses Claude Haiku
 * to produce a natural 1-2 sentence summary that's sent to the companion
 * browser for text-to-speech playback.
 *
 * Falls back to simple ANSI stripping if no ANTHROPIC_API_KEY is available.
 */

import type { Subsystem, SubsystemContext, SubsystemStatus, ActivityState } from './types'
import type { TerminalOutputBuffer } from './terminal-buffer'
import { VOICE_SUMMARY_PROMPT, VOICE_SUMMARY_MODEL, VOICE_SUMMARY_MAX_TOKENS } from './voice-prompts'

// ANSI stripping regex (same as lib/tts.ts but server-side)
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g
const NOISE_PATTERNS = [
  /[─━═│┃┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╰╯]+/g,
  /[░▒▓█▄▀■□▪▫●○◆◇▶▷◀◁▲△▼▽]+/g,
  /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣷⣯⣟⡿⢿⣻⣽]+/g,
  /\[[\d;]*[KJHfm]/g,
  /\r/g,
  /\x07/g,
]

interface VoiceSubsystemConfig {
  cooldownMs?: number       // Min time between speech events (default: 15s)
  minBufferSize?: number    // Min buffer size to trigger summarization (default: 100)
  maxCallsPerHour?: number  // Rate limit for LLM calls (default: 60)
}

export class VoiceSubsystem implements Subsystem {
  readonly name = 'voice'

  private context: SubsystemContext | null = null
  private buffer: TerminalOutputBuffer | null = null
  private unsubscribeBuffer: (() => void) | null = null
  private running = false
  private companionConnected = false

  // Guards
  private cooldownMs: number
  private minBufferSize: number
  private maxCallsPerHour: number
  private lastSpokeAt = 0
  private isSummarizing = false
  private callsThisHour = 0
  private hourResetTimer: NodeJS.Timeout | null = null

  // Stats
  private totalSpeechEvents = 0
  private totalLLMCalls = 0
  private lastSummary: string | null = null
  private llmAvailable: boolean | null = null

  constructor(config: VoiceSubsystemConfig = {}) {
    this.cooldownMs = config.cooldownMs ?? 15000
    this.minBufferSize = config.minBufferSize ?? 100
    this.maxCallsPerHour = config.maxCallsPerHour ?? 60
  }

  start(context: SubsystemContext): void {
    this.context = context
    this.running = true

    // Reset hourly rate limit every hour
    this.hourResetTimer = setInterval(() => {
      this.callsThisHour = 0
    }, 60 * 60 * 1000)
  }

  stop(): void {
    this.running = false
    if (this.unsubscribeBuffer) {
      this.unsubscribeBuffer()
      this.unsubscribeBuffer = null
    }
    if (this.hourResetTimer) {
      clearInterval(this.hourResetTimer)
      this.hourResetTimer = null
    }
    this.buffer = null
    this.context = null
  }

  getStatus(): SubsystemStatus {
    return {
      name: this.name,
      running: this.running,
      companionConnected: this.companionConnected,
      totalSpeechEvents: this.totalSpeechEvents,
      totalLLMCalls: this.totalLLMCalls,
      callsThisHour: this.callsThisHour,
      lastSummary: this.lastSummary,
      llmAvailable: this.llmAvailable,
      bufferSize: this.buffer?.getSize() ?? 0,
    }
  }

  /**
   * Attach to a terminal output buffer (called when session is linked)
   */
  attachBuffer(terminalBuffer: TerminalOutputBuffer): void {
    // Detach old buffer if any
    if (this.unsubscribeBuffer) {
      this.unsubscribeBuffer()
    }
    this.buffer = terminalBuffer
    // We don't need to subscribe for real-time data — we just read the buffer on idle
  }

  onActivityStateChange(state: ActivityState): void {
    if (state === 'idle') {
      this.maybeSummarizeAndSpeak()
    }
  }

  onCompanionConnectionChange(connected: boolean): void {
    this.companionConnected = connected
    if (!connected && this.buffer) {
      // Nobody listening, clear buffer to avoid wasted LLM calls
      this.buffer.clear()
    }
  }

  private async maybeSummarizeAndSpeak(): Promise<void> {
    if (!this.running || !this.context || !this.companionConnected) return
    if (this.isSummarizing) return

    // Cooldown check
    const now = Date.now()
    if (now - this.lastSpokeAt < this.cooldownMs) return

    // Buffer size check
    if (!this.buffer || this.buffer.getSize() < this.minBufferSize) return

    // Rate limit check
    if (this.callsThisHour >= this.maxCallsPerHour) {
      console.log(`[Cerebellum:Voice] Rate limit reached (${this.maxCallsPerHour}/hr), using fallback`)
      this.speakFallback()
      return
    }

    this.isSummarizing = true
    const rawBuffer = this.buffer.getBuffer()
    this.buffer.clear()

    try {
      const stripped = this.stripTerminalNoise(rawBuffer)
      if (stripped.length < 20) {
        this.isSummarizing = false
        return
      }

      // Try LLM summarization first
      const summary = await this.summarizeWithLLM(stripped)
      if (summary) {
        this.emitSpeech(summary)
      } else {
        // LLM not available, use simple fallback
        this.emitSpeech(this.simpleSummarize(stripped))
      }
    } catch (err) {
      console.error(`[Cerebellum:Voice] Summarization error:`, err)
      // Try fallback on error
      const stripped = this.stripTerminalNoise(rawBuffer)
      if (stripped.length >= 20) {
        this.emitSpeech(this.simpleSummarize(stripped))
      }
    } finally {
      this.isSummarizing = false
    }
  }

  private async summarizeWithLLM(cleanedText: string): Promise<string | null> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        if (this.llmAvailable === null) {
          console.log('[Cerebellum:Voice] No ANTHROPIC_API_KEY, using fallback summarization')
          this.llmAvailable = false
        }
        return null
      }

      // Dynamic require to avoid bundling issues
      const moduleName = '@anthropic-ai/sdk'
      // eslint-disable-next-line
      const Anthropic = require(moduleName).default
      const client = new Anthropic({ apiKey })

      // Truncate input to last 2000 chars for fast/cheap calls
      const truncated = cleanedText.length > 2000
        ? cleanedText.slice(-2000)
        : cleanedText

      this.callsThisHour++
      this.totalLLMCalls++

      const response = await client.messages.create({
        model: VOICE_SUMMARY_MODEL,
        max_tokens: VOICE_SUMMARY_MAX_TOKENS,
        messages: [{
          role: 'user',
          content: `${VOICE_SUMMARY_PROMPT}\n\nTerminal output:\n${truncated}`
        }],
      })

      this.llmAvailable = true
      const text = response.content?.[0]?.type === 'text' ? response.content[0].text : null
      return text?.trim() || null
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
        if (this.llmAvailable === null) {
          console.log('[Cerebellum:Voice] @anthropic-ai/sdk not installed, using fallback')
          this.llmAvailable = false
        }
      } else {
        console.error('[Cerebellum:Voice] LLM call failed:', error.message)
      }
      return null
    }
  }

  private emitSpeech(text: string): void {
    if (!this.context || !text || text.length < 5) return

    this.lastSpokeAt = Date.now()
    this.lastSummary = text
    this.totalSpeechEvents++

    this.context.emit({
      type: 'voice:speak',
      agentId: this.context.agentId,
      payload: { text },
    })

    console.log(`[Cerebellum:Voice] Speech event: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`)
  }

  private speakFallback(): void {
    if (!this.buffer || this.buffer.getSize() < this.minBufferSize) return
    const raw = this.buffer.getBuffer()
    this.buffer.clear()
    const stripped = this.stripTerminalNoise(raw)
    if (stripped.length >= 20) {
      this.emitSpeech(this.simpleSummarize(stripped))
    }
  }

  /**
   * Simple fallback: strip ANSI, take last 300 chars, trim to sentence
   */
  private simpleSummarize(text: string, maxLength = 200): string {
    let result = text
    if (result.length > maxLength) {
      result = result.slice(-maxLength)
      const firstSpace = result.indexOf(' ')
      if (firstSpace > 0 && firstSpace < 50) {
        result = result.slice(firstSpace + 1)
      }
    }
    return result
  }

  private stripTerminalNoise(raw: string): string {
    let text = raw.replace(ANSI_REGEX, '')
    for (const pattern of NOISE_PATTERNS) {
      text = text.replace(pattern, ' ')
    }
    // Remove progress bars and percentage indicators
    text = text.replace(/\[[\s=>#-]+\]\s*\d+%/g, '')
    text = text.replace(/^\s*\d{1,3}%\s*$/gm, '')
    // Collapse whitespace
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return text
  }
}
