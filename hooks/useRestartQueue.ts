'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSessionActivity } from './useSessionActivity'

interface RestartRequest {
  sessionName: string
  program: string
  programArgs: string
  queuedAt: number
}

/**
 * Hook that manages a queue of agents needing restart.
 * Watches session activity — when a queued agent reaches idle_prompt
 * (safe state), fires the restart API automatically.
 *
 * Usage:
 *   const { queueRestart, queueRestartAll, pendingCount, pendingSessions } = useRestartQueue()
 *   // After a plugin install:
 *   queueRestart('my-agent', 'claude', '--agent my-plugin-main-agent')
 */
export function useRestartQueue() {
  const [queue, setQueue] = useState<Map<string, RestartRequest>>(new Map())
  const { getSessionActivity } = useSessionActivity()
  const activeRestartsRef = useRef<Set<string>>(new Set())

  // Enqueue a single agent restart
  const queueRestart = useCallback((sessionName: string, program: string, programArgs: string) => {
    setQueue(prev => {
      const next = new Map(prev)
      next.set(sessionName, { sessionName, program, programArgs, queuedAt: Date.now() })
      return next
    })
  }, [])

  // Enqueue all provided agents for restart
  const queueRestartAll = useCallback((agents: Array<{ name: string; program?: string; programArgs?: string }>) => {
    setQueue(prev => {
      const next = new Map(prev)
      for (const agent of agents) {
        next.set(agent.name, {
          sessionName: agent.name,
          program: agent.program || 'claude',
          programArgs: agent.programArgs || '',
          queuedAt: Date.now(),
        })
      }
      return next
    })
  }, [])

  // Cancel a pending restart
  const cancelRestart = useCallback((sessionName: string) => {
    setQueue(prev => {
      const next = new Map(prev)
      next.delete(sessionName)
      return next
    })
  }, [])

  // Cancel all pending restarts
  const cancelAll = useCallback(() => {
    setQueue(new Map())
  }, [])

  // Watch activity: when queued agent hits idle_prompt, fire restart
  useEffect(() => {
    if (queue.size === 0) return

    for (const [sessionName, req] of queue) {
      // Skip if already restarting
      if (activeRestartsRef.current.has(sessionName)) continue

      const info = getSessionActivity(sessionName)
      if (info?.notificationType === 'idle_prompt') {
        // Safe state reached — fire restart
        activeRestartsRef.current.add(sessionName)

        fetch(`/api/sessions/${encodeURIComponent(sessionName)}/restart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ program: req.program, programArgs: req.programArgs }),
        })
          .then(res => {
            if (!res.ok) console.error(`[useRestartQueue] Restart failed for ${sessionName}:`, res.status)
          })
          .catch(err => console.error(`[useRestartQueue] Restart error for ${sessionName}:`, err))
          .finally(() => {
            activeRestartsRef.current.delete(sessionName)
            setQueue(prev => {
              const next = new Map(prev)
              next.delete(sessionName)
              return next
            })
          })
      }
    }
  }, [queue, getSessionActivity])

  return {
    queueRestart,
    queueRestartAll,
    cancelRestart,
    cancelAll,
    pendingCount: queue.size,
    pendingSessions: Array.from(queue.keys()),
  }
}
