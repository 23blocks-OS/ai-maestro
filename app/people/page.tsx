'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Contact, Plus } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { usePeople, type MeshPerson } from '@/hooks/usePeople'
import { VersionChecker } from '@/components/VersionChecker'
import { wouldLoop } from '@/lib/agent-manager'

type Form = { person: MeshPerson | null; displayName: string; title: string; role: string; email: string; phone: string; orgs: string; managerPersonId: string }
const EMPTY: Form = { person: null, displayName: '', title: '', role: '', email: '', phone: '', orgs: '', managerPersonId: '' }
/** "acme, Acme-Labs" -> ["acme", "acme-labs"] */
const orgList = (text: string) => [...new Set(text.split(',').map(o => o.trim().toLowerCase()).filter(Boolean))]

/**
 * People: the humans directory. Each person is stored on the host where the operator added them and
 * shown here by asking every host. No login: the operator is the authority, and per-person permissions
 * are policy in a trusted network, not a security boundary.
 */
export default function PeoplePage() {
  const { hosts } = useHosts()
  const [showInactive, setShowInactive] = useState(false)
  const { people, online, unreachable, loading, refresh } = usePeople(hosts, showInactive)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  const call = async (base: string, path: string, method: string, body?: unknown) => {
    const res = await fetch(`${base}/api/people${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Failed (${res.status})`)
  }

  const save = async () => {
    if (!form) return
    setError(null)
    const orgs = orgList(form.orgs)
    // People can be stored on different hosts, so only this page sees the whole chain: refuse a loop here
    const managerOf = (id: string) => people.find(x => x.id === id)?.managerPersonId
    if (form.person && form.managerPersonId && wouldLoop(form.person.id, form.managerPersonId, managerOf)) {
      setError('That would make a loop: that person already reports to this one, directly or through others')
      return
    }
    const body = {
      displayName: form.displayName, title: form.title, role: form.role, email: form.email, phone: form.phone,
      ...(form.person || orgs.length ? { orgs } : {}),
      ...(form.person ? { managerPersonId: form.managerPersonId || null } : form.managerPersonId ? { managerPersonId: form.managerPersonId } : {}),
    }
    try {
      if (form.person) await call(form.person.hostBase, `/${form.person.id}`, 'PATCH', body)
      else await call('', '', 'POST', body) // new people are added on the host this dashboard is on
      setForm(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const act = async (p: MeshPerson, method: 'DELETE' | 'PATCH') => {
    try {
      await call(p.hostBase, `/${p.id}`, method, method === 'PATCH' ? { active: true } : undefined)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const input = 'block mt-0.5 w-44 text-xs bg-gray-800 text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600'

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Contact className="w-4 h-4 text-violet-400" />
        <h1 className="text-sm font-medium">People</h1>
        <span className="text-xs text-gray-500">the humans who work with your agents</span>
        <div className="flex-1" />
        <label className="text-xs text-gray-400 flex items-center gap-1">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show deactivated
        </label>
        <button onClick={() => { setError(null); setForm(EMPTY) }}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700" title="Add a person to this host's directory">
          <Plus className="w-3 h-3" /> Add person
        </button>
      </header>

      {unreachable.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          Could not reach {unreachable.join(', ')}: the people stored there are missing from this list.
        </div>
      )}

      {form && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/60 flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-gray-400">Name<input value={form.displayName} autoFocus onChange={e => setForm({ ...form, displayName: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Role<input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Phone (+34600111222)<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Organizations (comma-separated)<input value={form.orgs} placeholder="acme, acme-labs" onChange={e => setForm({ ...form, orgs: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-gray-400">Reports to
            <select value={form.managerPersonId} onChange={e => setForm({ ...form, managerPersonId: e.target.value })} className={input}>
              <option value="">no one</option>
              {people.filter(x => x.active && x.id !== form.person?.id).map(x => <option key={x.id} value={x.id}>{x.displayName}</option>)}
            </select>
          </label>
          <button onClick={save} disabled={!form.displayName.trim()} className="text-xs px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Save</button>
          <button onClick={() => setForm(null)} className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">Cancel</button>
          <span className="basis-full text-[10px] text-gray-500">Stored on this host. The phone number is kept for a later phone integration; nothing calls it today. A person also shows in the organizations of the agents that report to them.</span>
        </div>
      )}
      {error && <div className="px-4 py-2 text-xs text-red-300">{error}</div>}

      <div className="flex-1 overflow-y-auto p-4">
        {people.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            {loading ? 'Loading people…' : 'No people yet. Add the people who work with your agents.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr><th className="py-1 pr-3">Name</th><th className="pr-3">Title / role</th><th className="pr-3">Reports to</th><th className="pr-3">Organizations</th><th className="pr-3">Phone</th><th className="pr-3">Stored on</th><th className="pr-3">App</th><th /></tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={`${p.hostId}:${p.id}`} className={`border-t border-gray-800 ${p.active ? '' : 'opacity-50'}`}>
                  <td className="py-1.5 pr-3 text-gray-100">{p.displayName}{!p.active && <span className="ml-2 text-[10px] text-gray-500">deactivated</span>}</td>
                  <td className="pr-3 text-gray-400">{[p.title, p.role].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="pr-3 text-gray-400">{p.managerPersonId ? (people.find(x => x.id === p.managerPersonId)?.displayName ?? 'someone on another host') : '-'}</td>
                  <td className="pr-3 text-gray-400">{p.orgs?.length ? p.orgs.join(', ') : '-'}</td>
                  <td className="pr-3 text-gray-400">{p.phone || '-'}</td>
                  <td className="pr-3 text-gray-500">{p.hostName}</td>
                  <td className="pr-3">{online.get(p.id)
                    ? <span className="text-emerald-400" title="Seen in the last 90 seconds">online via {online.get(p.id)!.join(', ')}</span>
                    : <span className="text-gray-600">not connected</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    {p.active ? (
                      <>
                        <button onClick={() => { setError(null); setForm({ person: p, displayName: p.displayName, title: p.title || '', role: p.role || '', email: p.email || '', phone: p.phone || '', orgs: (p.orgs || []).join(', '), managerPersonId: p.managerPersonId || '' }) }} className="px-2 text-gray-400 hover:text-gray-200">Edit</button>
                        <button onClick={() => act(p, 'DELETE')} className="px-2 text-gray-500 hover:text-red-300">Deactivate</button>
                      </>
                    ) : (
                      <button onClick={() => act(p, 'PATCH')} className="px-2 text-gray-400 hover:text-gray-200">Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <VersionChecker />
    </div>
  )
}
