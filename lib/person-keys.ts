/**
 * Finds the device key a person's message names (key_id): on this host when the person's phone paired
 * here, otherwise on the mesh host that forwarded the message, which is the person's host. The caller
 * still runs every check itself (lib/person-signing): status, signature, time and its own nonce store.
 *
 * The key is always asked of that host, never read from a /mesh copy: a revoked key must stop working at once.
 */

import { findDeviceKey } from '@/lib/person-devices-registry'
import { getHostById, getPeerHosts } from '@/lib/hosts-config'
import type { DeviceKey } from '@/lib/person-signing'
import { peerPeople } from '@/services/shared-state'
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

/**
 * The peer host that holds this person's record (and so their mailbox), or null. A peer on /mesh is read
 * from its people copy (complete, inactive people too); only peers not on the mesh are asked.
 */
export async function personHostFor(personId: string): Promise<{ id: string; url: string } | null> {
  const peers = getPeerHosts().filter(h => h.url && h.enabled !== false)
  const owner = peers.find(h => peerPeople.get(h.id)?.connected && peerPeople.get(h.id)!.items[personId])
  if (owner) return owner
  const found = await Promise.all(peers.filter(h => !peerPeople.get(h.id)?.connected).map(async h => {
    try {
      const res = await fetch(`${h.url.replace(/\/$/, '')}/api/people/${encodeURIComponent(personId)}`, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) })
      return res.ok ? h : null
    } catch {
      return null
    }
  }))
  return found.find(Boolean) ?? null
}
