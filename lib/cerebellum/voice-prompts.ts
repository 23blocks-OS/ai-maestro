/**
 * Voice Subsystem - LLM prompt for conversational speech
 */

export const VOICE_CONVERSATIONAL_PROMPT = `You are the voice of an AI coding agent: the user is in a live spoken conversation with the agent, and you decide what is said aloud. You get the agent's recent terminal activity, the recent conversation, and what you have already said. Your reply is spoken by text-to-speech exactly as written, so reply with only the words to speak, or with SILENT when nothing should be said.

How to choose:

1. When the agent wrote something conversational or explanatory, speak its own words, verbatim or lightly trimmed for speech. The agent has its own voice; do not rephrase or summarize it. For example:
   - "Let me dig into the middleware and the auth flow to understand what it would take."
   - "I found three issues in the login handler. Want me to fix them?"

2. When the output is mostly technical (file paths, diffs, build logs, test results, hashes, progress bars, migration output), say what happened in a sentence or two: the outcome, the numbers and any decision, without identifiers. For example:
   - Build output: "Build finished successfully in 18 seconds."
   - Test run: "All 42 tests passed, no failures."
   - Stack trace: "There's a type error in the auth module on the login handler."
   - Migration listing: "Found 12 migrations to run. 8 are schema changes and 4 are data migrations."

3. When there is both, prefer the agent's words and add the key numbers from the output.

4. Reply with SILENT when the output is only spinners, progress bars or cursor movement, when it is a prompt waiting for input, or when nothing has happened that you have not already said. Only speak again about something already said when there is new information, and build on it rather than restating it.

Spoken output is heard, not read: up to four sentences, no markdown, code, file paths, hashes, commit SHAs, key or schema names, line numbers or UUIDs. Keep exact quantities ("4 apps", "12 tests"). End with a question or a next step only at a real decision point or milestone.`

// Claude 3.5 Haiku (claude-3-5-haiku-20241022) was retired on 2026-02-19, so
// every call to it failed and voice fell back to templates.
export const VOICE_SUMMARY_MODEL = 'claude-haiku-4-5'
/** The reply that means "say nothing"; never spoken. */
export const VOICE_SILENT = 'SILENT'

export const VOICE_SUMMARY_MAX_TOKENS = 150

// --- Event Type Classification ---

export type TerminalEventType = 'error' | 'completion' | 'transition' | 'message' | 'status' | 'noise'

// Cooldown per event type (ms)
export const EVENT_COOLDOWNS: Record<TerminalEventType, number> = {
  error: 0,          // Errors speak immediately
  message: 0,        // Messages speak immediately
  completion: 10000, // Completions: 10s cooldown
  transition: 15000, // Phase transitions: 15s
  status: 30000,     // Status updates: 30s
  noise: Infinity,   // Noise: never (skip LLM entirely)
}

// Patterns for classifying terminal output before LLM call
const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bError:/,
  /\bERROR\b/,
  /\bfail(ed|ure|ing)?\b/i,
  /\bFAIL\b/,
  /\bpanic\b/i,
  /\bcrash(ed)?\b/i,
  /\bexception\b/i,
  /\bTypeError\b/,
  /\bSyntaxError\b/,
  /\bReferenceError\b/,
  /\bSegmentation fault\b/i,
  /\bnon-zero exit/i,
  /\bexit code [1-9]/i,
  /\bstack trace\b/i,
  /\btraceback\b/i,
]

const COMPLETION_PATTERNS = [
  /\b(all\s+)?\d+\s+(tests?|specs?)\s+pass(ed|ing)?\b/i,
  /\bbuild\s+(succeeded|successful|complete|finished|done)\b/i,
  /\bcompil(ed|ation)\s+(succeeded|successful|complete)\b/i,
  /\bdone[.!]?\s*$/im,
  /\bcomplete[d.]?\s*$/im,
  /\bfinished[.!]?\s*$/im,
  /\bsuccessfully\b/i,
  /\bready[.!]?\s*$/im,
  /\bpassed[.!]?\s*$/im,
  /\$ ?\s*$/m,  // Shell prompt reappearing (task done)
  /[❯➜>]\s*$/m,
]

const TRANSITION_PATTERNS = [
  /\bstarting\b/i,
  /\bmoving (on )?to\b/i,
  /\bnext[: ]/i,
  /\bphase\s+\d/i,
  /\bstep\s+\d/i,
  /\bshould I\b/i,
  /\bwant me to\b/i,
  /\bwhich (one|approach|option)\b/i,
  /\bfound\s+\d+\s+(option|issue|problem|file|match)/i,
]

const MESSAGE_PATTERNS = [
  /\[MESSAGE\]\s+From:/,
  /\[URGENT\].*From:/,
  /\[HIGH\].*From:/,
  /You have \d+ new message/,
]

/**
 * Classify terminal output into an event type using pattern matching.
 * This runs BEFORE the LLM call to enable adaptive cooldown and noise skipping.
 */
export function classifyTerminalEvent(text: string): TerminalEventType {
  // Check error patterns first (highest priority)
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(text)) return 'error'
  }

  // Check completion patterns
  for (const pattern of COMPLETION_PATTERNS) {
    if (pattern.test(text)) return 'completion'
  }

  // Check message patterns (AMP notifications)
  for (const pattern of MESSAGE_PATTERNS) {
    if (pattern.test(text)) return 'message'
  }

  // Check transition patterns
  for (const pattern of TRANSITION_PATTERNS) {
    if (pattern.test(text)) return 'transition'
  }

  // If text has enough substance, it's a status update
  // Short text with no patterns is noise
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
  if (wordCount < 5) return 'noise'

  return 'status'
}

// --- Template-based Fallback Summaries ---

interface TemplateMatcher {
  patterns: RegExp[]
  template: string | ((text: string) => string)
}

const FALLBACK_TEMPLATES: TemplateMatcher[] = [
  {
    patterns: [/(\d+)\s+(tests?|specs?)\s+pass/i, /pass(ed|ing)?\s+(\d+)/i],
    template: (text: string) => {
      const match = text.match(/(\d+)\s+(tests?|specs?)/i) || text.match(/pass\w*\s+(\d+)/i)
      const count = match?.[1] || 'all'
      return `${count} tests passed.`
    },
  },
  {
    patterns: [/\berror\b/i, /\bfail(ed|ure)?\b/i, /\bFAIL\b/],
    template: 'Something went wrong. Check the terminal.',
  },
  {
    patterns: [/\bbuild\s+(succeeded|successful|complete|finished|done)/i],
    template: 'Build finished successfully.',
  },
  {
    patterns: [/\bcreat(ed|ing)\b/i, /\bwritt(en|ing)\b/i, /\bsaved?\b/i, /\bupdat(ed|ing)\b/i, /\bmodifi(ed|ing)\b/i],
    template: 'Files have been updated.',
  },
  {
    patterns: [/\binstall(ing|ed)?\b/i, /\bfetch(ing|ed)?\b/i, /\bdownload(ing|ed)?\b/i],
    template: 'Installing dependencies.',
  },
  {
    patterns: [/\bmigrat(ing|ion|ed)\b/i],
    template: 'Running migrations.',
  },
  {
    patterns: [/\bdeploy(ing|ed|ment)?\b/i],
    template: 'Deployment in progress.',
  },
  {
    patterns: [/\bcommit(ted|ting)?\b/i, /\bpush(ed|ing)?\b/i],
    template: 'Changes committed.',
  },
  {
    patterns: [/\[MESSAGE\]/],
    template: 'You received a new message.',
  },
]

/**
 * Match terminal output against known patterns and return a template summary.
 * Used when LLM is unavailable or returns empty/invalid output.
 * Returns null if no template matches (falls through to simpleSummarize).
 */
export function templateSummarize(text: string): string | null {
  for (const matcher of FALLBACK_TEMPLATES) {
    for (const pattern of matcher.patterns) {
      if (pattern.test(text)) {
        if (typeof matcher.template === 'function') {
          return matcher.template(text)
        }
        return matcher.template
      }
    }
  }
  return null
}
