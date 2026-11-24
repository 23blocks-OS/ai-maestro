'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Mic, Pencil, Phone, Plus, Search, Smartphone, UserRoundX } from 'lucide-react'
import Header from '@/components/Header'
import { useHosts } from '@/hooks/useHosts'
import { usePeople, type MeshPerson, type MeshDevice } from '@/hooks/usePeople'
import { VersionChecker } from '@/components/VersionChecker'
import { wouldLoop } from '@/lib/agent-manager'
import { computeHash } from '@/lib/hash-utils'
import { useVoiceHosts, VoiceStatus, VoiceEnrollPanel } from '@/components/VoiceEnrollment'

type Form = { displayName: string; title: string; role: string; email: string; phone: string; orgs: string; managerPersonId: string }
const EMPTY: Form = { displayName: '', title: '', role: '', email: '', phone: '', orgs: '', managerPersonId: '' }
/** "acme, Acme-Labs" -> ["acme", "acme-labs"] */
const orgList = (text: string) => [...new Set(text.split(',').map(o => o.trim().toLowerCase()).filter(Boolean))]
const keyOf = (p: { hostId: string; id: string }) => `${p.hostId}:${p.id}`
const formOf = (p: MeshPerson): Form => ({
  displayName: p.displayName, title: p.title || '', role: p.role || '', email: p.email || '', phone: p.phone || '',
  orgs: (p.orgs || []).join(', '), managerPersonId: p.managerPersonId || '',
})
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
/** Hash-based, like category colours (AgentList.tsx): the same person always gets the same colour */
const hueOf = (id: string) => Math.abs(computeHash(id)) % 360

function Avatar({ person, size = 'sm' }: { person: MeshPerson; size?: 'sm' | 'lg' }) {
  const h = hueOf(person.id)
  return (
    <span
      aria-hidden
      className={`flex-shrink-0 inline-flex items-center justify-center rounded-full font-medium ${size === 'lg' ? 'w-14 h-14 text-lg' : 'w-8 h-8 text-xs'}`}
      style={{ background: `hsl(${h} 45% 22%)`, color: `hsl(${h} 80% 82%)` }}
    >
      {initials(person.displayName)}
    </span>
  )
}

/**
 * People: the humans directory. Each person is stored on the host where the operator added them and
 * shown here by asking every host. No login: the operator is the authority, and per-person permissions
 * are policy in a trusted network, not a security boundary.
 */
export default function PeoplePage() {
  const { hosts } = useHosts()
  const [showInactive, setShowInactive] = useState(false)
  const { people, online, devices, unreachable, loading, refresh } = usePeople(hosts, showInactive)
  const { voiceHosts, reloadVoice } = useVoiceHosts(hosts)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [adding, setAdding] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const voiceKnown = (p: MeshPerson) => voiceHosts.some(h => h.voiceprints.some(v => v.personId === p.id))
  const nameOf = (id?: string) => (id ? people.find(x => x.id === id)?.displayName ?? 'Someone on another host' : null)
  const phoneName = (d: MeshDevice) => d.deviceName || d.platform || d.deviceId.slice(0, 8)
  const pendingKeys = devices.filter(d => d.key?.status === 'pending')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? people.filter(p => [p.displayName, p.title, p.role, p.email, ...(p.orgs || [])].some(f => f?.toLowerCase().includes(q))) : people
    return [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName))
  }, [people, query])
  const person = people.find(p => keyOf(p) === selected) ?? null

  const choose = (p: MeshPerson | null) => {
    setSelected(p ? keyOf(p) : null)
    setForm(null); setAdding(false); setEnrolling(false); setError(null)
  }

  const call = async (base: string, path: string, method: string, body?: unknown) => {
    const res = await fetch(`${base}/api/people${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || `Failed (${res.status})`)
    return data
  }

  const save = async () => {
    if (!form) return
    setError(null)
    const orgs = orgList(form.orgs)
    const editing = adding ? null : person
    // People can be stored on different hosts, so only this page sees the whole chain: refuse a loop here
    const managerOf = (id: string) => people.find(x => x.id === id)?.managerPersonId
    if (editing && form.managerPersonId && wouldLoop(editing.id, form.managerPersonId, managerOf)) {
      setError('That would make a loop: that person already reports to this one, directly or through others')
      return
    }
    const body = {
      displayName: form.displayName, title: form.title, role: form.role, email: form.email, phone: form.phone,
      ...(editing || orgs.length ? { orgs } : {}),
      ...(editing ? { managerPersonId: form.managerPersonId || null } : form.managerPersonId ? { managerPersonId: form.managerPersonId } : {}),
    }
    try {
      if (editing) await call(editing.hostBase, `/${editing.id}`, 'PATCH', body)
      else {
        // New people are added on the host this dashboard is on
        const created = await call('', '', 'POST', body)
        if (created?.person?.id) setSelected(keyOf(created.person))
      }
      setForm(null); setAdding(false)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setActive = async (p: MeshPerson, active: boolean) => {
    try {
      await call(p.hostBase, `/${p.id}`, active ? 'PATCH' : 'DELETE', active ? { active: true } : undefined)
      if (!active && !showInactive) choose(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // A phone's signing key lets the person send verified messages from it (AMP spec 13): you approve it here
  const setKey = async (d: MeshDevice, action: 'approve' | 'revoke') => {
    if (!d.key) return
    try {
      const res = await fetch(`${d.hostBase}/api/people-devices/${d.deviceId}/key/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyId: d.key.keyId }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Could not ${action} the key (${res.status})`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const field = 'mt-1 block w-full text-sm bg-gray-900 border border-gray-700 text-gray-100 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-500'
  const detailOpen = Boolean(person || adding)
  const theirPhones = person ? devices.filter(d => d.personId === person.id) : []

  const editor = form && (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); save() }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-400 sm:col-span-2">Name<input value={form.displayName} autoFocus required onChange={e => setForm({ ...form, displayName: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Role<input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Phone<input value={form.phone} placeholder="+34600111222" onChange={e => setForm({ ...form, phone: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Organizations<input value={form.orgs} placeholder="acme, acme-labs" onChange={e => setForm({ ...form, orgs: e.target.value })} className={field} /></label>
        <label className="text-xs text-gray-400">Reports to
          <select value={form.managerPersonId} onChange={e => setForm({ ...form, managerPersonId: e.target.value })} className={field}>
            <option value="">No one</option>
            {people.filter(x => x.active && (adding || x.id !== person?.id)).map(x => <option key={keyOf(x)} value={x.id}>{x.displayName}</option>)}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-gray-500">Separate organizations with commas. {adding ? 'The person is stored on this host.' : `Stored on ${person?.hostName}.`} The phone number is kept for a later phone integration; nothing calls it today.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={!form.displayName.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs hover:bg-violet-700 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> {adding ? 'Add person' : 'Save'}</button>
        <button type="button" onClick={() => { setForm(null); setAdding(false); setError(null) }} className="px-3 py-1.5 rounded-md bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Cancel</button>
      </div>
    </form>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <Header />

      {unreachable.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20" role="status">
          Could not reach {unreachable.join(', ')}: the people stored there are missing from this list.
        </div>
      )}

      <main className="flex-1 flex min-h-0">
        <aside className={`${detailOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-shrink-0 flex-col border-r border-gray-800 min-h-0`}>
          <div className="px-4 pt-4 pb-3 space-y-3 border-b border-gray-800">
            <div className="flex items-baseline gap-2">
              <h1 className="text-base font-semibold">People</h1>
              <span className="text-xs text-gray-500">{people.filter(p => p.active).length} active</span>
              <button
                onClick={() => { choose(null); setAdding(true); setForm(EMPTY) }}
                className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add person
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, title or organization" aria-label="Search people"
                className="w-full text-sm bg-gray-900 border border-gray-800 rounded-md pl-8 pr-2.5 py-1.5 placeholder:text-gray-600 focus:outline-none focus:border-violet-500"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show deactivated people
            </label>
          </div>

          {pendingKeys.length > 0 && (
            <div className="mx-3 mt-3 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100" data-testid="pending-keys">
              <div className="font-medium mb-1.5">{pendingKeys.length === 1 ? 'A phone is' : `${pendingKeys.length} phones are`} waiting for your approval</div>
              <div className="space-y-1.5">
                {pendingKeys.map(d => (
                  <div key={`${d.hostName}:${d.deviceId}`} className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-violet-300 flex-shrink-0" />
                    <span className="min-w-0 truncate">{phoneName(d)} for {people.find(p => p.id === d.personId)?.displayName ?? d.personName ?? d.personId}</span>
                    <button onClick={() => setKey(d, 'approve')} className="ml-auto px-2 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700">Approve</button>
                    <button onClick={() => setKey(d, 'revoke')} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Reject</button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-violet-200/70">Once approved, the person can send verified messages to agents from that phone.</p>
            </div>
          )}

          <ul className="flex-1 overflow-y-auto py-2" aria-label="People">
            {shown.map(p => {
              const isOn = online.has(p.id)
              const isSel = selected === keyOf(p)
              return (
                <li key={keyOf(p)}>
                  <button
                    onClick={() => choose(p)}
                    aria-current={isSel ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 py-2.5 pr-4 text-left hover:bg-gray-900 border-l-2 pl-[14px] ${isSel ? 'bg-gray-900 border-violet-500' : 'border-transparent'} ${p.active ? '' : 'opacity-50'}`}
                  >
                    <span className="relative">
                      <Avatar person={p} />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${isOn ? 'bg-emerald-400' : 'bg-gray-600'}`} title={isOn ? 'App connected' : 'App not connected'} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-100 truncate">{p.displayName}</span>
                      <span className="block text-xs text-gray-500 truncate">{!p.active ? 'Deactivated' : [p.title, p.role].filter(Boolean).join(', ') || (p.orgs?.length ? p.orgs.join(', ') : 'No title')}</span>
                    </span>
                    {voiceKnown(p) && <Mic className="w-3.5 h-3.5 text-violet-300 flex-shrink-0" aria-label="Known by voice" />}
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-500">
                {loading ? 'Loading people…' : query ? `No one matches "${query}".` : 'No people yet. Add the people who work with your agents.'}
              </li>
            )}
          </ul>
        </aside>

        <section className={`${detailOpen ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col overflow-y-auto`}>
          {!detailOpen && (
            <div className="m-auto max-w-sm text-center px-6 text-sm text-gray-500">
              Pick a person to see how they work with your agents: their organizations, their phones, and whether agents know their voice.
            </div>
          )}

          {detailOpen && (
            <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 py-6 space-y-6">
              <button onClick={() => choose(null)} className="md:hidden flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"><ArrowLeft className="w-3.5 h-3.5" /> People</button>
              {error && <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-200" role="alert">{error}</div>}

              {adding && (
                <>
                  <h2 className="text-lg font-semibold">Add a person</h2>
                  {editor}
                </>
              )}

              {person && !adding && (
                <>
                  <div className="flex items-start gap-4">
                    <Avatar person={person} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold leading-tight">{person.displayName}</h2>
                      <p className="text-sm text-gray-400">{[person.title, person.role].filter(Boolean).join(', ') || 'No title'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {online.has(person.id) ? <span className="text-emerald-400">App connected via {online.get(person.id)!.join(', ')}</span> : 'App not connected'}
                        {!person.active && <span className="ml-2 text-amber-300">Deactivated</span>}
                      </p>
                    </div>
                    {!form && (
                      <div className="flex gap-1">
                        {person.active ? (
                          <>
                            <button onClick={() => { setError(null); setEnrolling(false); setForm(formOf(person)) }} className="p-2 rounded-md text-gray-400 hover:text-gray-100 hover:bg-gray-800" title="Edit" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => setActive(person, false)} className="p-2 rounded-md text-gray-400 hover:text-red-300 hover:bg-gray-800" title="Deactivate: hidden from calls and meetings, kept on record" aria-label="Deactivate"><UserRoundX className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <button onClick={() => setActive(person, true)} className="px-3 py-1.5 rounded-md bg-gray-800 text-gray-200 text-xs hover:bg-gray-700">Reactivate</button>
                        )}
                      </div>
                    )}
                  </div>

                  {form ? editor : (
                    <>
                      <Block title="Voice">
                        {enrolling
                          ? <VoiceEnrollPanel person={person} voiceHosts={voiceHosts} onClose={() => { setEnrolling(false); reloadVoice() }} />
                          : <VoiceStatus person={person} voiceHosts={voiceHosts} onEnroll={() => setEnrolling(true)} onChanged={reloadVoice} />}
                      </Block>

                      <Block title="Contact">
                        <Row label="Email" value={person.email} />
                        <Row label="Phone" value={person.phone} icon={<Phone className="w-3 h-3" />} />
                      </Block>

                      <Block title="Organization">
                        <Row label="Reports to" value={nameOf(person.managerPersonId)} />
                        <Row label="Direct reports" value={people.filter(x => x.managerPersonId === person.id).map(x => x.displayName).join(', ')} />
                        <div className="flex gap-3 text-sm">
                          <span className="w-28 flex-shrink-0 text-gray-500">Organizations</span>
                          <span className="flex flex-wrap gap-1.5">
                            {person.orgs?.length
                              ? person.orgs.map(o => <span key={o} className="px-2 py-0.5 rounded-full bg-gray-800 text-xs text-gray-300">{o}</span>)
                              : <span className="text-gray-600">None</span>}
                          </span>
                        </div>
                        <Row label="Stored on" value={person.hostName} />
                      </Block>

                      <Block title="Phones">
                        {theirPhones.length === 0 && <p className="text-xs text-gray-500">No phone is paired. The person pairs one from the AI Maestro app.</p>}
                        {theirPhones.map(d => (
                          <div key={`${d.hostName}:${d.deviceId}`} className="flex items-center gap-2 text-sm">
                            <Smartphone className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-200">{phoneName(d)}</span>
                            <span className="text-xs text-gray-500">via {d.hostName}</span>
                            {d.key?.status === 'active' && <span className="text-xs text-emerald-400">signs messages</span>}
                            {d.key?.status === 'pending' && (
                              <>
                                <button onClick={() => setKey(d, 'approve')} className="ml-auto px-2 py-0.5 rounded bg-violet-600 text-white text-xs hover:bg-violet-700">Approve</button>
                                <button onClick={() => setKey(d, 'revoke')} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs hover:bg-gray-700">Reject</button>
                              </>
                            )}
                            {d.key?.status === 'active' && (
                              <button onClick={() => setKey(d, 'revoke')} className="ml-auto text-xs text-gray-500 hover:text-red-300" title="For a lost or retired phone">Revoke key</button>
                            )}
                          </div>
                        ))}
                      </Block>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>
      <VersionChecker />
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-gray-400">{title}</h3>
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-2.5">{children}</div>
    </section>
  )
}

function Row({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 flex-shrink-0 text-gray-500">{label}</span>
      <span className={`min-w-0 break-words flex items-center gap-1.5 ${value ? 'text-gray-200' : 'text-gray-600'}`}>{value ? <>{icon}{value}</> : 'None'}</span>
    </div>
  )
}
