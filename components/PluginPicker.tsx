'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MarketplaceSkill } from '@/types/marketplace'

interface PluginRow {
  ref: string          // plugin@marketplace
  plugin: string
  marketplace: string
  description: string
  skills: number
}

/**
 * Pick plugins (and so their skills) for a new agent from every registered marketplace.
 * Nothing here knows any particular skill: a plugin appears when its marketplace is registered.
 * The wizard sends the picked `plugin@marketplace` refs to POST /api/agents/:id/skills/install after the agent exists.
 */
export default function PluginPicker({ selected, onChange }: { selected: string[]; onChange: (refs: string[]) => void }) {
  const [rows, setRows] = useState<PluginRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/marketplace/skills')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { skills?: MarketplaceSkill[] }) => {
        if (cancelled) return
        const byRef = new Map<string, PluginRow>()
        for (const s of data.skills || []) {
          const ref = `${s.plugin}@${s.marketplace}`
          const row = byRef.get(ref)
          if (row) row.skills += 1
          else byRef.set(ref, { ref, plugin: s.plugin, marketplace: s.marketplace, description: s.pluginDescription || s.description || '', skills: 1 })
        }
        setRows([...byRef.values()].sort((a, b) => a.plugin.localeCompare(b.plugin)))
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows || []).filter(r => !q || `${r.plugin} ${r.marketplace} ${r.description}`.toLowerCase().includes(q))
  }, [rows, query])

  if (failed) return <p className="text-xs text-gray-500">Could not load the skills list.</p>
  if (!rows) return <p className="text-xs text-gray-500">Loading skills…</p>
  if (rows.length === 0) return <p className="text-xs text-gray-500">No marketplaces are registered on this computer.</p>

  const toggle = (ref: string) => onChange(selected.includes(ref) ? selected.filter(r => r !== ref) : [...selected, ref])

  return (
    <div data-testid="create-plugins">
      {rows.length > 6 && (
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search skills"
          className="w-full px-3 py-1.5 mb-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      )}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {shown.map(r => (
          <label key={r.ref} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-800/60 cursor-pointer">
            <input type="checkbox" checked={selected.includes(r.ref)} onChange={() => toggle(r.ref)} className="mt-0.5" />
            <span className="min-w-0">
              <span className="text-xs text-gray-200">{r.plugin}</span>
              <span className="text-[11px] text-gray-500"> · {r.marketplace} · {r.skills} {r.skills === 1 ? 'skill' : 'skills'}</span>
              {r.description && <span className="block text-[11px] text-gray-500 truncate">{r.description}</span>}
            </span>
          </label>
        ))}
        {shown.length === 0 && <p className="text-xs text-gray-500 px-2">Nothing matches.</p>}
      </div>
    </div>
  )
}
