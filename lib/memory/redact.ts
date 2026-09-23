/**
 * Secret redaction for memory consolidation.
 *
 * Memories are stored verbatim, sent to an external classifier, and injected
 * back into agents' prompts. Transcripts contain secrets: a real one (a
 * production database password in an offboarding plan) came through the very
 * first consolidation run. Everything is redacted before it leaves the
 * transcript, so a secret never reaches the classifier, the memory store, or
 * another prompt.
 *
 * Deliberately over-eager: a redacted non-secret costs a few characters of
 * context; a stored secret is a leak.
 */

import { createHash } from 'crypto'

const R = '[REDACTED]'

const PATTERNS: Array<[RegExp, string]> = [
  // Private key blocks
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, R],
  // Credentials inside connection strings: scheme://user:PASSWORD@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${R}@`],
  // Provider token formats
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, R],          // Stripe
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, R],                 // Anthropic / OpenAI
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, R],                           // GitHub
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, R],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, R],                         // Slack
  [/\bAKIA[0-9A-Z]{16}\b/g, R],                                   // AWS access key id
  [/\bAIza[0-9A-Za-z_-]{30,}/g, R],                               // Google API key
  [/\bmd-[A-Za-z0-9_-]{16,}/g, R],                                // Mandrill
  [/\bapikey_[A-Za-z0-9_]{16,}/g, R],                             // TypeSafe / Jev
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, R], // JWT
  // UPPER_CASE env names ending in a secret word: ENCRYPTION_SERVICE_KEY=abc, DB_PASSWORD: abc
  [/\b([A-Z][A-Z0-9_]*(?:KEY|SALT|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|PWD)\b["']?\s*[:=]\s*)(["'`]?)[^\s"'`,;)]{4,}\2/g, `$1$2${R}$2`],
  // key = value / key: value for secret-looking names
  [/\b((?:[A-Za-z0-9]+_)*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*)(["'`]?)[^\s"'`,;]{4,}\2/gi, `$1$2${R}$2`],
  // "password `hunter2`" / "password: hunter2" in prose
  [/\b(password|passwd|passphrase|secret)\b([^\n`]{0,24})`[^`\n]{3,}`/gi, `$1$2\`${R}\``],
  // A quoted value right after a secret-ish word, in prose: "encryption key ('abc' + salt 'xyz')",
  // "the token is \"abc\"". A real key and salt reached a memory card this way (2026-09-23).
  [/\b((?:encryption |signing |secret |api |private |master )?(?:key|salt|secret|passphrase|password|token|pepper|seed)s?\b[^'"`\n]{0,24}?)(['"`])[^'"`\n]{3,80}\2/gi, `$1$2${R}$2`],
  // A bare credential-looking token in parentheses after a secret-ish word:
  // "legacy shared encryption key (abc123)" slipped past the quoted pattern.
  [/\b((?:key|salt|secret|passphrase|password|token|pepper|seed)s?\b[^()\n]{0,30}?\()([A-Za-z0-9_+/=.-]{6,80})(\))/gi, `$1${R}$3`],
  // "... + salt 'xyz'" continuation after an already-redacted value
  [/(\[REDACTED\]['"`]?\s*\+\s*(?:salt|pepper)?\s*)(['"`])[^'"`\n]{3,80}\2/gi, `$1$2${R}$2`],
]

/**
 * Where a secret VALUE sits, for learning it (group `v`). A value found once is
 * then redacted everywhere it appears, in any form: the same key reached cards
 * as `ENV=value`, "hardcoded `value`", "key (value)" and plain "retain value
 * because…" (2026-09-23). Patterns can find the first; only the value can find
 * the rest.
 */
const VALUE_PATTERNS: RegExp[] = [
  /\b[A-Z][A-Z0-9_]*(?:KEY|SALT|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|PWD)\b["']?\s*[:=]\s*["'`]?(?<v>[^\s"'`,;)]{4,})/g,
  /\b(?:[A-Za-z0-9]+_)*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*["'`]?(?<v>[^\s"'`,;]{4,})/gi,
  /\b(?:password|passwd|passphrase|secret)\b[^\n`]{0,24}`(?<v>[^`\n]{3,})`/gi,
  /\b(?:(?:encryption |signing |secret |api |private |master )?(?:key|salt|secret|passphrase|password|token|pepper|seed)s?\b[^'"`\n]{0,24}?)(['"`])(?<v>[^'"`\n]{3,80})\1/gi,
  /\b(?:key|salt|secret|passphrase|password|token|pepper|seed)s?\b[^()\n]{0,30}?\((?<v>[A-Za-z0-9_+/=.-]{6,80})\)/gi,
  /\+\s*(?:salt|pepper)\s*(['"`])(?<v>[^'"`\n]{3,80})\1/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?<v>[^\s@/]+)@/gi,
]

const NOT_SECRETS = new Set(['true', 'false', 'null', 'undefined', 'none', 'changeme', 'password', 'secret', 'redacted', 'example', 'placeholder'])

/** Only credential-looking values are learned, so ordinary words never become "secrets". */
function looksLikeCredential(v: string): boolean {
  const s = v.trim()
  if (s.length < 8 || /\s/.test(s)) return false
  if (NOT_SECRETS.has(s.toLowerCase()) || s.includes('REDACTED')) return false
  if (/^\$\{|^<.*>$|^process\.env|^\$[A-Z_]+$|^\*+$|^x+$/i.test(s)) return false // references, not values
  return /\d/.test(s) || (/[a-z]/.test(s) && /[A-Z]/.test(s)) || s.length >= 14
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Secret values in a text, as found by the value patterns. */
export function extractSecretValues(text: string): string[] {
  const out = new Set<string>()
  for (const pattern of VALUE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const v = m.groups?.v
      if (v && looksLikeCredential(v)) out.add(v.trim())
    }
  }
  return [...out]
}

const TOKEN = /[A-Za-z0-9_+/.\-]{8,120}/g

/**
 * Redact secrets: every pattern, then every token whose hash is a known secret
 * (tokens are hashed, so the known-secret list never holds a value itself).
 */
export function redactSecrets(text: string, knownHashes?: Set<string>): string {
  let out = text
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  if (knownHashes && knownHashes.size > 0) {
    out = out.replace(TOKEN, token => {
      for (const t of [token, token.replace(/[._-]+$/, ''), token.replace(/^[._-]+/, '')]) {
        if (knownHashes.has(hashSecret(t))) return token.replace(t, R)
      }
      return token
    })
  }
  return out
}
