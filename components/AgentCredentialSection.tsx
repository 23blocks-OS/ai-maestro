'use client'

import { useEffect, useState } from 'react'
import { KeyRound, AlertTriangle } from 'lucide-react'
import type { AgentCredential, CredentialCheck } from '@/types/agent'

type Kind = AgentCredential['kind']
const KINDS: Array<{ kind: Kind; label: string; hint: string }> = [
  { kind: 'host-login', label: "This computer's login", hint: 'The account this computer is logged in to with /login. Every agent on it shares it.' },
  { kind: 'oauth-token', label: 'Subscription token', hint: 'A token from `claude setup-token` (a Pro or Max plan), stored in the vault.' },
  { kind: 'api-key', label: 'API key', hint: 'An Anthropic API key, stored in the vault.' },
  { kind: 'gateway', label: 'Gateway', hint: 'A compatible gateway (OpenRouter, a proxy): its key in the vault, its address and model here.' },
  { kind: 'config-dir', label: 'Separate login folder', hint: 'A Claude config folder on this computer logged in to another account.' },
]

/**
 * Which account or key the agent calls its model with (#65). The secret is the NAME of a vault entry: the value is
 * read at launch and never shown or stored here. Warnings come from the agent's host: a settings file that would be
 * ignored, or that would win over this choice.
 */
export default function AgentCredentialSection({ agentId, baseUrl, value, onChange }: {
  /** Absent while the agent is being created: there is nothing to check yet */
  agentId?: string
  baseUrl: string
  value: AgentCredential | null | undefined
  onChange: (next: AgentCredential | null) => void
}) {
  const [warnings, setWarnings] = useState<string[]>([])
  const [check, setCheck] = useState<CredentialCheck | null>(null)
  const kind: Kind = value?.kind || 'host-login'
  const set = (patch: Partial<AgentCredential>) => {
    const next = { ...(value || { kind: 'host-login' as Kind }), ...patch } as AgentCredential
    onChange(next.kind === 'host-login' && !next.account ? null : next)
  }

  useEffect(() => {
    if (!agentId) return
    let off = false
    fetch(`${baseUrl}/api/agents/${agentId}/credential`).then(r => (r.ok ? r.json() : null)).then(d => { if (!off) setWarnings(d?.warnings || []); setCheck(d?.check || null) }).catch(() => {})
    return () => { off = true }
  }, [agentId, baseUrl])

  const input = 'w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-gray-400 flex items-center gap-2" htmlFor="cred-kind">
        <KeyRound className="w-4 h-4" /> Model access (which account the agent uses)
      </label>
      <select id="cred-kind" className={input} value={kind}
        onChange={e => set({ kind: e.target.value as Kind, secret: undefined, baseUrl: undefined, model: undefined, dir: undefined })}>
        {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </select>
      <p className="text-xs text-gray-500">{KINDS.find(k => k.kind === kind)?.hint} {agentId ? 'Applied at the next wake.' : 'Used from its first start.'}</p>

      {(kind === 'oauth-token' || kind === 'api-key' || kind === 'gateway') && (
        <label className="block text-xs text-gray-400">Vault entry (its name, never the value)
          <input className={`${input} mt-1 font-mono`} value={value?.secret || ''} placeholder="e.g. PARTNER_MAX_TOKEN" autoComplete="off" spellCheck={false}
            onChange={e => set({ secret: e.target.value.trim() })} />
          <span className="block mt-1 text-gray-500">Store it on the agent&apos;s computer with <code>aim-secret set NAME</code>.</span>
        </label>
      )}
      {kind === 'gateway' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-gray-400">Address
            <input className={`${input} mt-1`} value={value?.baseUrl || ''} placeholder="https://..." onChange={e => set({ baseUrl: e.target.value.trim() })} />
          </label>
          <label className="block text-xs text-gray-400">Model (optional)
            <input className={`${input} mt-1 font-mono`} value={value?.model || ''} onChange={e => set({ model: e.target.value.trim() })} />
          </label>
        </div>
      )}
      {kind === 'config-dir' && (
        <label className="block text-xs text-gray-400">Folder
          <input className={`${input} mt-1 font-mono`} value={value?.dir || ''} placeholder="/Users/you/.claude-other" onChange={e => set({ dir: e.target.value.trim() })} />
        </label>
      )}
      <label className="block text-xs text-gray-400">Whose account or plan this is (shown to people, optional)
        <input className={`${input} mt-1`} value={value?.account || ''} placeholder="e.g. Partner's Max plan" onChange={e => set({ account: e.target.value })} />
      </label>

      {check && (
        <p data-testid="credential-check" className={`text-xs rounded-lg px-3 py-2 ${check.state === 'match' ? 'bg-emerald-500/10 text-emerald-300' : check.state === 'mismatch' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
          Now: {check.detail} <span className="text-gray-500">(since {new Date(check.at).toLocaleTimeString()})</span>
        </p>
      )}
      {warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-1">
          {warnings.map(w => (
            <p key={w} className="text-xs text-red-300 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}</p>
          ))}
        </div>
      )}
    </div>
  )
}
