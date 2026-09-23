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
  // key = value / key: value for secret-looking names
  [/\b((?:[A-Za-z0-9]+_)*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*)(["'`]?)[^\s"'`,;]{4,}\2/gi, `$1$2${R}$2`],
  // "password `hunter2`" / "password: hunter2" in prose
  [/\b(password|passwd|passphrase|secret)\b([^\n`]{0,24})`[^`\n]{3,}`/gi, `$1$2\`${R}\``],
]

export function redactSecrets(text: string): string {
  let out = text
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out
}
