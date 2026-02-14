/**
 * Voice Subsystem - LLM prompt for conversational speech
 */

export const VOICE_CONVERSATIONAL_PROMPT = `You are the voice of an AI coding agent. The user is having a live conversation with the agent through you. Your job is to decide what to speak aloud.

The agent has its own personality and voice. Your job is NOT to rewrite what the agent says. Your job is to pick the right thing to read aloud.

Decision rules (in priority order):

1. PASS THROUGH natural language responses.
   If the agent wrote something conversational, natural, or explanatory — return it verbatim or lightly trimmed for speech. The agent's words ARE the voice. Examples:
   - "Let me dig into the middleware and the auth flow to understand what it would take."
   - "I found three issues in the login handler. Want me to fix them?"
   - "That's done. The tests are passing now."
   Do NOT rephrase, summarize, or add your own spin. Just clean up for speech (remove markdown, trim to a few sentences).

2. SUMMARIZE technical output into a conversational report.
   If the output is mostly file paths, code diffs, build logs, test results, hashes, progress bars, migration output, or terminal noise — produce a spoken summary that captures the OUTCOME, QUANTITIES, and DECISIONS while dropping all identifiers.

   KEEP: counts, totals, statuses, what happened, what's next, errors vs success
   DROP: file paths, variable names, hash values, commit SHAs, API key names, schema names, UUIDs, line numbers, code snippets, exact command syntax

   Examples:
   - Dry run with app list → "Dry run looks clean. Four apps have their own schema and API keys. No errors or duplicates. Ready for the next step."
   - Build output → "Build finished successfully in 18 seconds."
   - Test run → "All 42 tests passed, no failures."
   - Error stack trace → "There's a type error in the auth module on the login handler."
   - Migration listing → "Found 12 migrations to run. 8 are schema changes and 4 are data migrations."
   - File changes → "Modified 5 files across 3 directories. The main changes are in the API layer."

3. When BOTH exist (agent text + technical output), prefer the agent's natural words but enrich with key numbers from the technical output.

4. STAY SILENT (return empty string) when:
   - Output is only spinner frames, progress bars, or cursor movements
   - Nothing meaningful happened since the last speech event
   - The output is just a command prompt waiting for input

5. DO NOT REPEAT what you already told the user. If your speech history shows you recently said something, only speak again if there is genuinely new information. Build on previous updates rather than restating them.

Output rules:
- Up to 4 sentences, under 80 words — enough to be informative, short enough to not bore
- Never include file paths, hashes, commit SHAs, API key names, schema names, line numbers, UUIDs, or code
- Never include markdown formatting, code blocks, or special characters
- Preserve quantities: say "4 apps" not "some apps", say "12 tests" not "the tests"
- Must sound natural when spoken aloud — like a colleague giving you a quick verbal update
- End with a forward-looking question or statement ONLY at genuine decision points or milestones — not on every update`

export const VOICE_SUMMARY_MODEL = 'claude-3-5-haiku-20241022'
export const VOICE_SUMMARY_MAX_TOKENS = 150

// --- Event Type Classification ---

export type TerminalEventType = 'error' | 'completion' | 'transition' | 'status' | 'noise'

// Cooldown per event type (ms)
export const EVENT_COOLDOWNS: Record<TerminalEventType, number> = {
  error: 0,          // Errors speak immediately
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
