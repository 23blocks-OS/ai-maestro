'use client'

/**
 * What the phone shows for an agent that is asleep. The phone lists every agent in its Hosts tab, but the
 * terminal tab only knew how to show a running one, so a sleeping agent could not be woken from a phone at all.
 * One tap wakes it with what it already has (its tool, how freely it acts, its options); "Wake with…" opens the
 * same dialog as the desktop, for a first wake or a different choice.
 */
import { useState } from 'react'
import { Moon, Power, Loader2, SlidersHorizontal } from 'lucide-react'
import WakeAgentDialog from './WakeAgentDialog'
import { buildWakeBody, type WakeChoiceOptions } from '@/lib/wake-request'
import { canWakeInOneClick, oneClickWakeOptions, wakeSummary } from '@/lib/wake-flow'
import type { Agent } from '@/types/agent'

export default function MobileWakePanel({ agent, name, hostName, onWoken }: {
  agent: Agent
  name: string
  hostName?: string
  /** Called once the wake request is accepted, so the list refreshes and the terminal can open. */
  onWoken: () => void
}) {
  const [waking, setWaking] = useState(false)
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const oneClick = canWakeInOneClick(agent)

  const wake = async (program: string, options?: WakeChoiceOptions) => {
    setWaking(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWakeBody(program, options, agent.hostUrl)),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to wake agent')
      // The session can come up while its program does not start; say so instead of looking healthy.
      if (data?.programStarted === false && data?.programError) setMessage({ text: `${name} woke, but its program did not start: ${data.programError}`, bad: true })
      onWoken()
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unknown error'
      setMessage({ text: agent.hostUrl ? `Could not wake ${name}. The host may be unreachable: ${text}` : `Could not wake ${name}: ${text}`, bad: true })
    } finally {
      setWaking(false)
      setDialogOpen(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-gray-900" data-testid="mobile-wake-panel">
      <div className="w-16 h-16 mb-4 rounded-full bg-yellow-900/30 flex items-center justify-center">
        <Moon className="w-8 h-8 text-yellow-500" />
      </div>
      <p className="text-lg font-medium text-gray-200 break-words max-w-full">{name}</p>
      <p className="text-sm text-gray-500 mb-5">
        is asleep{hostName ? ` on ${hostName}` : ''}.{oneClick ? ` Waking it starts ${wakeSummary(agent)}.` : ' It has not been started before, so choose how.'}
      </p>
      {oneClick ? (
        <button
          onClick={() => wake('', oneClickWakeOptions(agent))}
          disabled={waking}
          data-testid="mobile-wake"
          className="w-full max-w-xs min-h-[48px] px-6 py-3 bg-green-600 text-white rounded-lg active:bg-green-500 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {waking ? <><Loader2 className="w-5 h-5 animate-spin" />Waking…</> : <><Power className="w-5 h-5" />Wake {name}</>}
        </button>
      ) : null}
      <button
        onClick={() => setDialogOpen(true)}
        disabled={waking}
        data-testid="mobile-wake-with"
        className={oneClick
          ? 'mt-3 min-h-[44px] px-4 text-sm text-gray-400 active:text-green-400 flex items-center gap-2 disabled:opacity-50'
          : 'w-full max-w-xs min-h-[48px] px-6 py-3 bg-green-600 text-white rounded-lg active:bg-green-500 disabled:opacity-50 flex items-center justify-center gap-2'}
      >
        <SlidersHorizontal className="w-4 h-4" />
        {oneClick ? 'Wake with… (choose the tool and how freely)' : 'Choose how to wake it'}
      </button>
      {message && <p className={`mt-4 text-sm max-w-xs break-words ${message.bad ? 'text-red-400' : 'text-gray-400'}`} role="status">{message.text}</p>}

      <WakeAgentDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={wake}
        agentName={agent.name || agent.id}
        agentAlias={agent.alias}
        defaultPermissionMode={agent.permissionMode}
        defaultProgram={agent.program}
        defaultLaunchOptions={(agent as { launchOptions?: Record<string, string | boolean> }).launchOptions}
        hostUrl={agent.hostUrl}
      />
    </div>
  )
}
