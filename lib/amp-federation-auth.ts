/**
 * Federation: who is allowed to hand us mail from another provider.
 *
 * Protocol 06-federation §Provider Authentication: the forwarding provider
 * signs the request. The receiver looks up that provider's public key through
 * discovery (/.well-known/agent-messaging.json) and verifies the signature.
 * Before this, /api/v1/federation/deliver trusted whatever name arrived in the
 * X-AMP-Provider header.
 *
 * The signed text is `${timestamp}.${rawBody}`: the timestamp header, a dot,
 * and the request body exactly as received (not re-serialised, so both sides
 * sign the same bytes whatever their JSON encoder does).
 */

import crypto from 'crypto'
import dns from 'dns'
import net from 'net'
import { verifySignature } from '@/lib/amp-keys'

/** A request older (or newer) than this many seconds is a replay. */
export const PROVIDER_SIGNATURE_WINDOW_SECONDS = 300

const POSITIVE_TTL_MS = 60 * 60 * 1000 // spec: well-known cached 1 hour
const NEGATIVE_TTL_MS = 60 * 1000

export interface ProviderDocument {
  public_key?: string
  endpoint?: string
}

export type FetchProviderDocument = (provider: string) => Promise<ProviderDocument | null>

export type ProviderAuthResult =
  | { ok: true; fingerprintHex: string }
  | { ok: false; status: number; error: string; message: string }

const HOSTNAME_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** A DNS name, not an address and not a bare label: the only thing we will fetch from. */
export function isPlausibleProviderName(name: string): boolean {
  return HOSTNAME_RE.test(name) && !net.isIP(name)
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const v = ip.toLowerCase()
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:')
}

/** The 32 raw bytes of an Ed25519 public key, as hex, from a PEM. */
export function publicHexFromPem(pem: string): string | null {
  try {
    const der = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })
    if (der.length < 44) return null
    return der.subarray(der.length - 32).toString('hex')
  } catch {
    return null
  }
}

const cache = new Map<string, { doc: ProviderDocument | null; expires: number }>()

/** Discovery by well-known URL over HTTPS. Never follows redirects, never reaches private addresses. */
export const fetchProviderDocument: FetchProviderDocument = async (provider) => {
  if (!isPlausibleProviderName(provider)) return null
  const hit = cache.get(provider)
  if (hit && hit.expires > Date.now()) return hit.doc
  let doc: ProviderDocument | null = null
  try {
    const addrs = await dns.promises.lookup(provider, { all: true })
    if (addrs.length === 0 || addrs.some(a => isPrivateAddress(a.address))) throw new Error('private address')
    const res = await fetch(`https://${provider}/.well-known/agent-messaging.json`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    })
    if (res.ok) doc = (await res.json()) as ProviderDocument
  } catch {
    doc = null
  }
  cache.set(provider, { doc, expires: Date.now() + (doc ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) })
  return doc
}

export function clearProviderCache(): void {
  cache.clear()
}

/**
 * Verify that `provider` signed this request.
 * `signature` is base64 Ed25519 over `${timestamp}.${rawBody}`.
 */
export async function verifyProviderRequest(opts: {
  provider: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  nowMs?: number
  fetchDoc?: FetchProviderDocument
}): Promise<ProviderAuthResult> {
  const { provider, timestamp, signature, rawBody } = opts
  const fail = (status: number, error: string, message: string): ProviderAuthResult => ({ ok: false, status, error, message })

  if (!isPlausibleProviderName(provider)) {
    return fail(400, 'invalid_provider', 'X-AMP-Provider must be a DNS name')
  }
  if (!timestamp || !signature) {
    return fail(401, 'unauthorized', 'X-AMP-Signature and X-AMP-Timestamp are required')
  }
  const ts = Number(timestamp)
  const nowSeconds = Math.floor((opts.nowMs ?? Date.now()) / 1000)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > PROVIDER_SIGNATURE_WINDOW_SECONDS) {
    return fail(401, 'unauthorized', 'X-AMP-Timestamp is outside the allowed window')
  }
  const doc = await (opts.fetchDoc || fetchProviderDocument)(provider)
  const keyHex = doc?.public_key ? publicHexFromPem(doc.public_key) : null
  if (!keyHex) {
    return fail(401, 'unauthorized', 'The forwarding provider publishes no public key; cannot authenticate it')
  }
  if (!verifySignature(`${timestamp}.${rawBody}`, signature, keyHex)) {
    return fail(401, 'unauthorized', 'Provider signature failed verification')
  }
  return { ok: true, fingerprintHex: keyHex }
}

/**
 * A message may only arrive from the provider that hosts its sender:
 * `alice@acme.crabmail.ai` is accepted from `crabmail.ai`, not from anyone else.
 */
export function senderBelongsToProvider(fromAddress: string, provider: string): boolean {
  const host = (fromAddress.split('@')[1] || '').toLowerCase()
  const p = provider.toLowerCase()
  return host === p || host.endsWith(`.${p}`)
}
