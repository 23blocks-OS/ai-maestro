/**
 * Ask every host for its people and list what each returns. Nothing is copied or merged: a person
 * lives on the host where the operator added them, like an agent. A host that is down is named,
 * never silently empty; a host that has no such route yet (not updated) simply holds no people.
 */

import type { PersonRecord } from '@/types/person'

export interface PeopleTarget {
  /** How the browser reaches the host: '' for this one, else the base URL */
  base: string
  hostId: string
  hostName: string
}

export type MeshPerson = PersonRecord & { hostBase: string; hostName: string }

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>

export async function collectPeople(
  targets: PeopleTarget[],
  fetcher: Fetcher,
  includeInactive = false,
): Promise<{ people: MeshPerson[]; unreachable: string[] }> {
  const results = await Promise.all(targets.map(async t => {
    try {
      const res = await fetcher(`${t.base}/api/people${includeInactive ? '?includeInactive=1' : ''}`)
      if (res.status === 404) return { ok: true as const, t, mine: [] as MeshPerson[] }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const mine: MeshPerson[] = (data.people || []).map((p: PersonRecord) => ({ ...p, hostBase: t.base, hostName: t.hostName }))
      return { ok: true as const, t, mine }
    } catch {
      return { ok: false as const, t, mine: [] as MeshPerson[] }
    }
  }))
  // The same id on two hosts (a person added on both) is shown once per host record, labelled by host
  const people = results.flatMap(r => r.mine).sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { people, unreachable: results.filter(r => !r.ok).map(r => r.t.hostName) }
}
