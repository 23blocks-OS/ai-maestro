/**
 * The provider key and provider notices (AMP 07 "Provider Notices", 06 "Provider Authentication", 03 "Reserved names").
 *
 * The provider key is this host's own Ed25519 key, published in /v1/info and /.well-known/agent-messaging.json. It
 * signs the messages the provider writes itself (a hold, an approval request, an outcome): ordinary AMP messages from
 * the reserved address `_provider@<tenant>.<provider>`, with the canonical signature (lib/amp-trust signingString).
 *
 * In a mesh each host is its own provider instance with its own key (~/.aimaestro/amp/provider-key.pem, mode 600).
 * A notice forwarded by a peer is checked with that peer's published key (its /api/v1/info), never with a key sent
 * along with the message and never from address resolution of `_provider`.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeFileAtomicSync } from '@/lib/atomic-write.mjs'
import { calculateFingerprint } from '@/lib/amp-keys'
import { publicHexFromPem } from '@/lib/amp-federation-auth'
import { checkSignature, signingString, type SignatureCheck, type SignedFields } from '@/lib/amp-trust'
import { AMP_PROVIDER_NAME, getAMPProviderDomain } from '@/lib/types/amp'
import { getHostById, getOrganization, isSelf } from '@/lib/hosts-config-server.mjs'

/** AMP 03: no agent or person may register this name */
export const PROVIDER_NAME = '_provider'

export const isProviderAddress = (address: string | null | undefined) => (address || '').split('@')[0].toLowerCase() === PROVIDER_NAME

/** `_provider@<tenant>.<provider>` for this host's tenant */
export const providerNoticeAddress = () => `${PROVIDER_NAME}@${getAMPProviderDomain(getOrganization() || undefined)}`

export interface ProviderKey { privatePem: string; publicPem: string; publicHex: string; fingerprint: string }

const keyFile = () => path.join(os.homedir(), '.aimaestro', 'amp', 'provider-key.pem')
let cached: { file: string; key: ProviderKey } | null = null

function fromPrivate(privatePem: string): ProviderKey {
  const pub = crypto.createPublicKey(privatePem)
  const publicPem = pub.export({ type: 'spki', format: 'pem' }).toString()
  const publicHex = pub.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex')
  return { privatePem, publicPem, publicHex, fingerprint: calculateFingerprint(publicHex) }
}

/** This host's provider key, created on first use. Null when it cannot be read or made (and in a test using the real HOME). */
export function getProviderKey(): ProviderKey | null {
  const file = keyFile()
  if (cached?.file === file) return cached.key
  if (process.env.VITEST && os.homedir() === os.userInfo().homedir) return null
  try {
    let pem: string
    try { pem = fs.readFileSync(file, 'utf8') } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      pem = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
      writeFileAtomicSync(file, pem, { mode: 0o600 })
    }
    cached = { file, key: fromPrivate(pem) }
    return cached.key
  } catch (e) {
    console.warn(`[AMP] provider key unavailable: ${(e as Error).message}`)
    return null
  }
}

/** The canonical signature (07 "Signature Format") of fields, with the provider key */
export function signAsProvider(f: SignedFields): string | null {
  const key = getProviderKey()
  if (!key) return null
  return crypto.sign(null, Buffer.from(signingString(f)), key.privatePem).toString('base64')
}

const peerKeys = new Map<string, { hex: string | null; expires: number }>()

/** The provider key a host publishes: our own, or a mesh peer's from its /api/v1/info (06a: hosts are pre-configured) */
export async function providerKeyOfHost(hostId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (isSelf(hostId)) return getProviderKey()?.publicHex ?? null
  const hit = peerKeys.get(hostId)
  if (hit && hit.expires > Date.now()) return hit.hex
  const host = getHostById(hostId)
  let hex: string | null = null
  if (host?.url && host.enabled !== false) {
    try {
      const res = await fetchImpl(`${host.url.replace(/\/$/, '')}/api/v1/info`, { signal: AbortSignal.timeout(5000) })
      const info = res.ok ? await res.json() as { public_key?: unknown } : null
      hex = typeof info?.public_key === 'string' ? publicHexFromPem(info.public_key) : null
    } catch { /* unreachable: no key */ }
  }
  peerKeys.set(hostId, { hex, expires: Date.now() + (hex ? 3_600_000 : 60_000) })
  return hex
}

export function clearProviderKeyCache(): void { peerKeys.clear(); cached = null }

/**
 * 07 "Provider Notices" rule 4: `from` ends with "." + payload.context.provider, `provider` is the one expected, and the
 * signature verifies with that provider's discovered key. Anything else is not a verified notice.
 */
export function checkProviderNotice(f: SignedFields, signature: string | null | undefined, keyHex: string | null, provider: string = AMP_PROVIDER_NAME): SignatureCheck {
  const ctx = (f.payload as { context?: { provider?: unknown } } | null)?.context
  const claimed = typeof ctx?.provider === 'string' ? ctx.provider.toLowerCase() : ''
  if (claimed !== provider.toLowerCase() || !f.from.toLowerCase().endsWith(`.${claimed}`)) return signature ? 'bad' : 'unsigned'
  return checkSignature(f, signature, keyHex)
}
