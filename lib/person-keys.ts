/**
 * Finds the device key a person's message names (key_id): on this host when the person's phone paired
 * here, otherwise on the mesh host that forwarded the message, which is the person's host. The caller
 * still runs every check itself (lib/person-signing): status, signature, time and its own nonce store.
 */

import { findDeviceKey } from '@/lib/person-devices-registry'
import { getHostById } from '@/lib/hosts-config'
import type { DeviceKey } from '@/lib/person-signing'
import type { PersonDeviceRecord } from '@/types/person-device'

const REMOTE_TIMEOUT_MS = 5000

export async function personKeyFor(keyId: string, viaHostId?: string | null): Promise<DeviceKey | null> {
  const local = findDeviceKey(keyId)
  if (local) return { keyId, personId: local.personId, publicKey: local.key.publicKey, status: local.key.status, revokedAt: local.key.revokedAt }

  const host = viaHostId ? getHostById(viaHostId) : null
  if (!host?.url) return null
  try {
    const res = await fetch(`${host.url.replace(/\/$/, '')}/api/people-devices`, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) })
    if (!res.ok) return null
    const { devices } = await res.json() as { devices?: PersonDeviceRecord[] }
    const d = (devices || []).find(x => x.key?.keyId === keyId)
    return d?.key ? { keyId, personId: d.personId, publicKey: d.key.publicKey, status: d.key.status, revokedAt: d.key.revokedAt } : null
  } catch {
    return null
  }
}
