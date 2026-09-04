/**
 * AMP attachments — validation and host-local storage.
 *
 * Implements `spec/attachment-guide.md` v0.1.2 from agentmessaging/protocol.
 *
 * WHY THERE IS NO S3 HERE
 *
 * The spec says file content is "stored externally by the provider (e.g., in S3
 * or equivalent object storage)". Equivalent is the operative word: it
 * constrains the metadata and the flow, never the backend. The client asks for
 * an upload URL and PUTs to whatever it is given, so a URL on this host is as
 * conformant as a presigned S3 one — and it keeps files inside the tailnet, with
 * no third party in the data path, which is the same reason we did not adopt a
 * relay for transport.
 *
 * WHAT THE SPEC MAKES MANDATORY, AND WHAT IT DOES NOT
 *
 * Three checks are MUST, and they apply whether the recipient is on this host or
 * another continent — there is no local-delivery carve-out anywhere in the spec
 * (`06a-local-networks.md` and `10-local-bus.md` do not mention attachments at
 * all):
 *
 *   1. size and digest must match what was declared      → else `rejected`
 *   2. executables and blocked MIME types must be refused → else `rejected`
 *   3. magic bytes must match the declared content_type   → else `rejected`
 *      (application/octet-stream and empty files exempt)
 *
 * Antivirus and prompt-injection scanning are SHOULD. We do neither, so we use
 * the status the spec provides for exactly that case — `basic_clean`, "passed
 * required checks only" — and advertise `av_scanning: false` in /v1/info. The
 * temptation was to invent a status or to return `clean`; the first is
 * unnecessary and the second would be a claim we have not earned.
 */

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ---------------------------------------------------------------------------
// Limits — normative, from spec section 9
// ---------------------------------------------------------------------------

export const MAX_ATTACHMENT_SIZE = 26_214_400        // 25 MB
export const MAX_TOTAL_ATTACHMENT_SIZE = 104_857_600 // 100 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 10
/** Presigned upload URL lifetime. Spec: 1 hour maximum. */
export const UPLOAD_URL_TTL_MS = 60 * 60 * 1000
/** Uploaded-but-never-routed attachments are swept. Spec: 2 hours. */
export const ORPHAN_TTL_MS = 2 * 60 * 60 * 1000
/** Routed attachment lifetime. Spec: at least 7 days. */
export const ROUTED_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type ScanStatus = 'pending' | 'clean' | 'basic_clean' | 'suspicious' | 'rejected'

export interface AttachmentRecord {
  id: string
  filename: string
  content_type: string
  size: number
  digest: string
  scan_status: ScanStatus
  uploaded_at: string
  /** Set once the bytes are on disk and verified. */
  confirmed_at?: string
  /** Set once referenced by a routed message. Enforces single use. */
  routed_at?: string
  /** Why it was rejected, when it was. */
  reason?: string
  /** Owning agent, from the API key used to create it. */
  owner?: string
}

// ---------------------------------------------------------------------------
// Identifiers and filenames — spec section 3 constraints
// ---------------------------------------------------------------------------

/** `att_<unix_timestamp>_<random_hex>`. */
export function generateAttachmentId(): string {
  return `att_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(8).toString('hex')}`
}

/**
 * Spec: IDs containing `/`, `\`, `..` or null bytes MUST be rejected to prevent
 * path traversal. We are stricter and accept only the documented shape, because
 * this value is used to build a filesystem path.
 */
export function isValidAttachmentId(id: unknown): id is string {
  return typeof id === 'string' && /^att_\d{1,20}_[a-f0-9]{8,64}$/.test(id)
}

const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
])

/**
 * Spec: no path separators, null bytes or control characters; only
 * `[a-zA-Z0-9._-]`; reserved OS names forbidden; leading/trailing dots and
 * spaces stripped; double-encoded separators (`%2F`) MUST be rejected.
 */
export function sanitizeFilename(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  // Reject before decoding: `%2F` must not become a separator later.
  if (/%2f|%5c|%00/i.test(raw)) return null
  if (raw.includes('/') || raw.includes('\\') || raw.includes('\0')) return null
  if (/[\x00-\x1f\x7f]/.test(raw)) return null

  const stripped = raw.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (!stripped) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(stripped)) return null
  if (stripped.length > 255) return null
  if (RESERVED_NAMES.has(stripped.split('.')[0].toUpperCase())) return null
  return stripped
}

// ---------------------------------------------------------------------------
// Digest — spec section 3
// ---------------------------------------------------------------------------

/**
 * Spec: `<algorithm>:<hex>`, sha256 only for this protocol version.
 * Unrecognised prefixes MUST be rejected rather than silently ignored.
 */
export function isValidDigest(digest: unknown): digest is string {
  return typeof digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(digest)
}

export function computeDigest(bytes: Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

// ---------------------------------------------------------------------------
// Blocked types — spec section 8
// ---------------------------------------------------------------------------

/** MUST block: executables and scripts, whatever the declared type says. */
const BLOCKED_MIME = new Set([
  'application/x-msdownload', 'application/x-executable', 'application/x-mach-binary',
  'application/x-elf', 'application/vnd.microsoft.portable-executable',
  'application/x-dosexec', 'application/x-sharedlib',
  'application/x-msdos-program', 'application/x-ms-installer',
  'application/x-sh', 'application/x-shellscript', 'application/x-csh',
  'application/x-bat', 'application/x-msi', 'application/javascript',
  'text/javascript', 'application/x-python-code',
])

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bat', 'cmd', 'com', 'scr', 'msi', 'msp',
  'sh', 'bash', 'zsh', 'csh', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse',
  'wsf', 'wsh', 'jar', 'app', 'deb', 'rpm', 'pkg', 'dmg', 'apk',
])

export function isBlockedType(contentType: string, filename: string): string | null {
  if (BLOCKED_MIME.has(contentType.toLowerCase().split(';')[0].trim())) {
    return `blocked MIME type: ${contentType}`
  }
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return `blocked file extension: .${ext}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Magic bytes — spec section 5, required step 3
// ---------------------------------------------------------------------------

/** Signatures keyed by the primary type they imply. */
const MAGIC: Array<{ bytes: number[]; offset?: number; primary: string; label: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], primary: 'application', label: 'pdf' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], primary: 'image', label: 'png' },
  { bytes: [0xff, 0xd8, 0xff], primary: 'image', label: 'jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], primary: 'image', label: 'gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], primary: 'image', label: 'webp/riff' },
  { bytes: [0x00, 0x00, 0x01, 0x00], primary: 'image', label: 'ico' },
  { bytes: [0x1f, 0x8b], primary: 'application', label: 'gzip' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], primary: 'application', label: 'zip/ooxml' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], primary: 'application', label: 'elf' },
  { bytes: [0x4d, 0x5a], primary: 'application', label: 'pe' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], primary: 'application', label: 'mach-o' },
]

/** Executables are refused regardless of what they claim to be. */
const EXECUTABLE_MAGIC = new Set(['elf', 'pe', 'mach-o'])

function detectMagic(bytes: Buffer) {
  for (const sig of MAGIC) {
    const at = sig.offset ?? 0
    if (bytes.length < at + sig.bytes.length) continue
    if (sig.bytes.every((b, i) => bytes[at + i] === b)) return sig
  }
  return null
}

/**
 * Spec: verify magic bytes match the declared content_type at the PRIMARY type
 * level. `application/octet-stream` is exempt; empty files are exempt.
 *
 * Primary-level only, deliberately: a DOCX is a zip, and an OOXML file declared
 * as `application/vnd.openxmlformats-…` would fail a stricter comparison while
 * being entirely legitimate.
 */
export function checkMagicBytes(bytes: Buffer, contentType: string): string | null {
  if (bytes.length === 0) return null
  const declared = contentType.toLowerCase().split(';')[0].trim()
  const detected = detectMagic(bytes)

  if (detected && EXECUTABLE_MAGIC.has(detected.label)) {
    return `file is an executable (${detected.label}) regardless of its declared type`
  }
  if (declared === 'application/octet-stream') return null
  if (!detected) return null

  const declaredPrimary = declared.split('/')[0]
  if (declaredPrimary !== detected.primary) {
    return `content does not match declared type: looks like ${detected.label} (${detected.primary}/*), declared ${declared}`
  }
  return null
}

// ---------------------------------------------------------------------------
// The required checks, in one place
// ---------------------------------------------------------------------------

export interface ScanResult {
  status: Extract<ScanStatus, 'basic_clean' | 'rejected'>
  reason?: string
}

/**
 * Run every MUST from spec section 5 over the received bytes.
 *
 * Returns `basic_clean` on success — never `clean`, because that would claim an
 * antivirus and injection scan we do not perform.
 */
export function scanAttachment(
  bytes: Buffer,
  declared: { filename: string; content_type: string; size: number; digest: string }
): ScanResult {
  if (bytes.length !== declared.size) {
    return { status: 'rejected', reason: `size mismatch: declared ${declared.size}, received ${bytes.length}` }
  }
  const actual = computeDigest(bytes)
  if (actual !== declared.digest) {
    return { status: 'rejected', reason: 'digest mismatch: content does not match the declared sha256' }
  }
  const blocked = isBlockedType(declared.content_type, declared.filename)
  if (blocked) return { status: 'rejected', reason: blocked }

  const magic = checkMagicBytes(bytes, declared.content_type)
  if (magic) return { status: 'rejected', reason: magic }

  return { status: 'basic_clean' }
}

// ---------------------------------------------------------------------------
// Storage — content-addressed, host-local
// ---------------------------------------------------------------------------

export function attachmentsRoot(): string {
  return path.join(os.homedir(), '.aimaestro', 'attachments')
}

function recordPath(id: string): string {
  return path.join(attachmentsRoot(), `${id}.json`)
}

/**
 * Content lives under its digest, not its id.
 *
 * The client already computes a sha256, so content-addressing is free — and it
 * means the same file attached ten times occupies one copy, and a corrupted
 * write can never masquerade as a good one.
 */
export function contentPath(digest: string): string {
  const hex = digest.replace(/^sha256:/, '')
  return path.join(attachmentsRoot(), 'blobs', hex.slice(0, 2), hex)
}

export function readRecord(id: string): AttachmentRecord | null {
  if (!isValidAttachmentId(id)) return null
  try {
    return JSON.parse(fs.readFileSync(recordPath(id), 'utf8'))
  } catch {
    return null
  }
}

export function writeRecord(record: AttachmentRecord): void {
  fs.mkdirSync(attachmentsRoot(), { recursive: true })
  const tmp = `${recordPath(record.id)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
  fs.renameSync(tmp, recordPath(record.id))
}

export function storeContent(digest: string, bytes: Buffer): void {
  const dest = contentPath(digest)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  // Write then rename: a reader must never see a partial blob under a digest
  // that promises the whole file.
  const tmp = `${dest}.tmp-${crypto.randomBytes(6).toString('hex')}`
  fs.writeFileSync(tmp, bytes)
  fs.renameSync(tmp, dest)
}

export function readContent(digest: string): Buffer | null {
  try {
    return fs.readFileSync(contentPath(digest))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Capability tokens for download URLs
// ---------------------------------------------------------------------------

/**
 * Spec: the `url` in a routed payload requires "no authentication ... enabling
 * cross-provider recipients to download without an account on the originating
 * provider".
 *
 * So the URL itself must carry the authority — but it travels inside a message
 * to another host, and must therefore never carry an API key. A token scoped to
 * one attachment id, signed with a host secret and expiring, gives exactly the
 * access needed and nothing else.
 */
function tokenSecret(): string {
  const file = path.join(os.homedir(), '.aimaestro', 'attachment-token.key')
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    const secret = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, secret, { mode: 0o600 })
    return secret
  }
}

export function signToken(id: string, expiresAtMs: number): string {
  const payload = `${id}.${expiresAtMs}`
  const sig = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  return `${expiresAtMs}.${sig}`
}

export function verifyToken(id: string, token: unknown): boolean {
  if (typeof token !== 'string') return false
  const [expRaw, sig] = token.split('.')
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  const expected = crypto.createHmac('sha256', tokenSecret()).update(`${id}.${exp}`).digest('base64url')
  // Constant-time: a token check that leaks position by timing is a token check
  // that can be brute-forced one character at a time.
  const a = Buffer.from(sig || '')
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
