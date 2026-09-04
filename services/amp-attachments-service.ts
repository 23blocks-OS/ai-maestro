/**
 * AMP attachments — the provider side.
 *
 * Implements the upload/confirm/status/download flow from
 * agentmessaging/protocol `spec/attachment-guide.md` v0.1.2, backed by
 * host-local content-addressed storage rather than object storage. See
 * lib/amp-attachments for why that is conformant ("S3 **or equivalent**") and
 * for the validation rules.
 *
 * The client already implements this flow exactly — `amp-send.sh --attach` has
 * been calling these four endpoints and getting 404 — so nothing on the agent
 * side needs to change. Every agent already running the plugin gains
 * attachments the moment this ships.
 */

import {
  MAX_ATTACHMENT_SIZE,
  ORPHAN_TTL_MS,
  ROUTED_TTL_MS,
  UPLOAD_URL_TTL_MS,
  computeDigest,
  generateAttachmentId,
  isBlockedType,
  isValidAttachmentId,
  isValidDigest,
  readContent,
  readRecord,
  sanitizeFilename,
  scanAttachment,
  signToken,
  storeContent,
  verifyToken,
  writeRecord,
  type AttachmentRecord,
} from '@/lib/amp-attachments'
import { getAgentIdFromApiKey, extractApiKeyFromHeader } from '@/lib/amp-auth'
import { serviceError, type ServiceResult, type ServiceErrorCode } from '@/services/service-errors'

/**
 * Spec-defined error codes (section 7). Using these rather than ad-hoc messages
 * matters: they are the contract the client's recovery patterns key off — e.g.
 * `attachment_rejected` means "do NOT retry with the same file", which is a
 * different instruction from `attachment_pending`.
 */
function fail(code: ServiceErrorCode, status: number, message: string): ServiceResult<never> {
  return serviceError(code, message, status)
}

/** Absolute base for URLs handed to other hosts. */
function selfBase(): string {
  return process.env.AIMAESTRO_PUBLIC_URL || `http://localhost:${process.env.PORT || 23000}`
}

function downloadUrl(id: string, ttlMs: number): string {
  const token = signToken(id, Date.now() + ttlMs)
  return `${selfBase()}/api/v1/attachments/${id}/content?token=${encodeURIComponent(token)}`
}

function requireAgent(authHeader: string | null): string | null {
  const key = extractApiKeyFromHeader(authHeader)
  if (!key) return null
  return getAgentIdFromApiKey(key)
}

// ---------------------------------------------------------------------------
// POST /api/v1/attachments/upload
// ---------------------------------------------------------------------------

export interface UploadInitRequest {
  filename?: unknown
  content_type?: unknown
  size?: unknown
  digest?: unknown
}

export function initUpload(
  body: UploadInitRequest,
  authHeader: string | null
): ServiceResult<{ attachment_id: string; upload_url: string; expires_at: string }> {
  const owner = requireAgent(authHeader)
  if (!owner) return fail('unauthorized', 401, 'Valid API key required')

  const filename = sanitizeFilename(body.filename)
  if (!filename) {
    return fail('invalid_request', 400,
      'filename must be 1-255 characters of [a-zA-Z0-9._-], with no path separators or reserved OS names')
  }

  const contentType = typeof body.content_type === 'string' && body.content_type
    ? body.content_type
    : 'application/octet-stream'

  const size = typeof body.size === 'number' ? body.size : NaN
  if (!Number.isInteger(size) || size < 0) {
    return fail('invalid_request', 400, 'size must be a non-negative integer')
  }
  if (size > MAX_ATTACHMENT_SIZE) {
    return fail('attachment_too_large', 413,
      `Attachment exceeds the ${MAX_ATTACHMENT_SIZE} byte limit`)
  }

  // Wrong algorithm gets its own code, because the recovery differs: the sender
  // must re-hash, not resize or re-upload.
  if (typeof body.digest === 'string' && !isValidDigest(body.digest)) {
    return fail('invalid_digest_algorithm', 422, 'digest must be sha256:<lowercase hex>')
  }
  if (!isValidDigest(body.digest)) {
    return fail('invalid_request', 400, 'digest is required')
  }

  // Refuse executables here as well as after upload. The spec requires the
  // post-upload check; doing it now too saves transferring a file we would
  // certainly reject, and gives the sender the answer immediately.
  const blocked = isBlockedType(contentType, filename)
  if (blocked) return fail('attachment_rejected', 422, blocked)

  const id = generateAttachmentId()
  writeRecord({
    id,
    filename,
    content_type: contentType,
    size,
    digest: body.digest,
    scan_status: 'pending',
    uploaded_at: new Date().toISOString(),
    owner,
  })

  return {
    data: {
      attachment_id: id,
      // Spec section 9: presigned upload URL lifetime is 1 hour maximum.
      upload_url: `${selfBase()}/api/v1/attachments/${id}/content?token=${encodeURIComponent(signToken(id, Date.now() + UPLOAD_URL_TTL_MS))}`,
      expires_at: new Date(Date.now() + UPLOAD_URL_TTL_MS).toISOString(),
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// PUT /api/v1/attachments/{id}/content?token=
// ---------------------------------------------------------------------------

export function receiveContent(
  id: string,
  token: string | null,
  bytes: Buffer
): ServiceResult<{ ok: true; scan_status: string }> {
  if (!isValidAttachmentId(id)) return fail('attachment_not_found', 404, 'Unknown attachment')
  if (!verifyToken(id, token)) return fail('unauthorized', 401, 'Invalid or expired upload token')

  const record = readRecord(id)
  if (!record) return fail('attachment_not_found', 404, 'Unknown attachment')
  if (record.confirmed_at) {
    // Re-uploading over a confirmed attachment would change content that a
    // signed message already vouches for by digest.
    return fail('attachment_already_used', 409, 'Attachment content is already stored')
  }
  if (bytes.length > MAX_ATTACHMENT_SIZE) {
    return fail('attachment_too_large', 413, `Attachment exceeds the ${MAX_ATTACHMENT_SIZE} byte limit`)
  }

  // Every MUST from spec section 5, over the bytes actually received.
  const verdict = scanAttachment(bytes, {
    filename: record.filename,
    content_type: record.content_type,
    size: record.size,
    digest: record.digest,
  })

  if (verdict.status === 'rejected') {
    // Spec: rejected attachments are deleted, and the sender must not retry
    // with the same file.
    writeRecord({ ...record, scan_status: 'rejected', reason: verdict.reason })
    return fail('attachment_rejected', 422, verdict.reason || 'Attachment failed validation')
  }

  storeContent(record.digest, bytes)
  writeRecord({
    ...record,
    scan_status: verdict.status,
    confirmed_at: new Date().toISOString(),
  })

  return { data: { ok: true, scan_status: verdict.status }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/v1/attachments/{id}/confirm
// ---------------------------------------------------------------------------

export function confirmUpload(
  id: string,
  authHeader: string | null
): ServiceResult<{ attachment_id: string; scan_status: string }> {
  const owner = requireAgent(authHeader)
  if (!owner) return fail('unauthorized', 401, 'Valid API key required')
  if (!isValidAttachmentId(id)) return fail('attachment_not_found', 404, 'Unknown attachment')

  const record = readRecord(id)
  if (!record) return fail('attachment_not_found', 404, 'Unknown attachment')
  if (record.owner && record.owner !== owner) {
    // Not "forbidden": telling a stranger the attachment exists is itself a leak.
    return fail('attachment_not_found', 404, 'Unknown attachment')
  }
  if (record.scan_status === 'rejected') {
    return fail('attachment_rejected', 422, record.reason || 'Attachment failed validation')
  }
  if (!record.confirmed_at) {
    // Nothing was PUT. Scanning happens on receipt, so there is nothing to
    // confirm and saying "ok" here would be a claim about a file we never saw.
    return fail('attachment_pending', 409, 'Attachment content has not been uploaded yet')
  }

  return { data: { attachment_id: id, scan_status: record.scan_status }, status: 200 }
}

// ---------------------------------------------------------------------------
// GET /api/v1/attachments/{id}
// ---------------------------------------------------------------------------

export function getAttachmentStatus(
  id: string,
  authHeader: string | null
): ServiceResult<Record<string, unknown>> {
  const owner = requireAgent(authHeader)
  if (!owner) return fail('unauthorized', 401, 'Valid API key required')
  if (!isValidAttachmentId(id)) return fail('attachment_not_found', 404, 'Unknown attachment')

  const record = readRecord(id)
  if (!record) return fail('attachment_not_found', 404, 'Unknown attachment')
  if (record.owner && record.owner !== owner) {
    return fail('attachment_not_found', 404, 'Unknown attachment')
  }

  return {
    data: {
      id: record.id,
      filename: record.filename,
      content_type: record.content_type,
      size: record.size,
      digest: record.digest,
      scan_status: record.scan_status,
      uploaded_at: record.uploaded_at,
      ...(record.reason ? { reason: record.reason } : {}),
      // Only offer a URL once there are bytes behind it. A download URL for an
      // attachment that was never uploaded is the "3 attachments resolving to
      // nothing" failure — indistinguishable from success at the far end.
      ...(record.confirmed_at
        ? {
            url: downloadUrl(record.id, ROUTED_TTL_MS),
            expires_at: new Date(Date.now() + ROUTED_TTL_MS).toISOString(),
          }
        : {}),
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/attachments/{id}/content?token=
// ---------------------------------------------------------------------------

export interface AttachmentDownload {
  bytes: Buffer
  filename: string
  contentType: string
  digest: string
}

/**
 * Download. Authorised by the capability token in the URL, not an API key —
 * the spec requires cross-provider recipients to fetch "without an account on
 * the originating provider", and that URL travels inside a message to another
 * host, where an API key must never go.
 */
export function downloadContent(
  id: string,
  token: string | null
): ServiceResult<AttachmentDownload> {
  if (!isValidAttachmentId(id)) return fail('attachment_not_found', 404, 'Unknown attachment')
  if (!verifyToken(id, token)) return fail('attachment_expired', 410, 'Invalid or expired download token')

  const record = readRecord(id)
  if (!record || !record.confirmed_at) {
    return fail('attachment_not_found', 404, 'Unknown attachment')
  }
  if (record.scan_status === 'rejected') {
    return fail('attachment_rejected', 422, record.reason || 'Attachment failed validation')
  }

  const bytes = readContent(record.digest)
  if (!bytes) return fail('attachment_not_found', 404, 'Attachment content is no longer stored')

  // Verify on the way out as well as on the way in. Storage is content
  // addressed, so a mismatch here means the blob was corrupted or tampered
  // with on disk, and serving it would break the recipient's own check with no
  // explanation of where the damage happened.
  if (computeDigest(bytes) !== record.digest) {
    return fail('attachment_rejected', 422, 'Stored content no longer matches its digest')
  }

  return {
    data: {
      bytes,
      filename: record.filename,
      contentType: record.content_type,
      digest: record.digest,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Spec section 9: attachments uploaded but not referenced by a routed message
 * within 2 hours are deleted, so orphans cannot accumulate.
 *
 * Exported for a scheduled sweep; deliberately not wired to a timer here, so
 * the caller decides when it runs.
 */
export function isOrphaned(record: AttachmentRecord, now = Date.now()): boolean {
  if (record.routed_at) return false
  const uploaded = Date.parse(record.uploaded_at)
  if (!Number.isFinite(uploaded)) return false
  return now - uploaded > ORPHAN_TTL_MS
}
