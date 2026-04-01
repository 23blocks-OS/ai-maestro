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
 * Hook that manages a deferred-restart queue for Claude Code agents.
 *
 * **Problem solved:** After a plugin install or configuration change, agents
 * need to restart so Claude reloads its environment. But we cannot send /exit
 * while Claude is actively processing — that would corrupt output or lose work.
 *
 * **Mechanism:**
 * 1. Callers enqueue agents via `queueRestart(sessionName, program, args)`.
 * 2. A `useEffect` watches the `useSessionActivity` hook for each queued agent.
 * 3. When a queued agent's `notificationType` reaches `'idle_prompt'` (safe state),
 *    the hook automatically fires `POST /api/sessions/{id}/restart`.
 * 4. The agent is removed from the queue once the restart request completes.
 *
 * **Concurrency guard:** `activeRestartsRef` prevents duplicate restart calls
 * for the same session if the effect re-runs before the fetch resolves.
 *
 * **Exported API:**
 * - `queueRestart(sessionName, program, programArgs)` — enqueue a single agent
 * - `queueRestartAll(agents[])` — enqueue multiple agents at once
 * - `cancelRestart(sessionName)` — remove an agent from the queue
 * - `cancelAll()` — clear the entire queue
 * - `pendingCount` — number of agents still waiting for safe state
 * - `pendingSessions` — array of session names in the queue
 *
 * @example
 *   const { queueRestart, queueRestartAll, pendingCount, pendingSessions } = useRestartQueue()
 *   // After a plugin install:
 *   queueRestart('my-agent', 'claude', '--agent my-plugin-main-agent')
 */
export function useRestartQueue() {
  const [queue, setQueue] = useState<Map<string, RestartRequest>>(new Map())
  const { getSessionActivity } = useSessionActivity()
  const activeRestartsRef = useRef<Set<string>>(new Set())
  // SF-044: Store getSessionActivity in a ref so the queue-processing effect doesn't re-run
  // on every WebSocket event (getSessionActivity changes identity whenever the activity map updates)
  const getSessionActivityRef = useRef(getSessionActivity)
  useEffect(() => { getSessionActivityRef.current = getSessionActivity }, [getSessionActivity])

  /** Enqueue a single agent for deferred restart. The restart fires automatically
   *  once the agent's session reaches idle_prompt (safe state). */
  const queueRestart = useCallback((sessionName: string, program: string, programArgs: string) => {
    setQueue(prev => {
      const next = new Map(prev)
      next.set(sessionName, { sessionName, program, programArgs, queuedAt: Date.now() })
      return next
    })
  }, [])

  /** Enqueue multiple agents for deferred restart in a single state update.
   *  Each agent restarts independently when it reaches its own safe state. */
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

  /** Remove a single agent from the restart queue (e.g. if the user cancelled the operation). */
  const cancelRestart = useCallback((sessionName: string) => {
    setQueue(prev => {
      const next = new Map(prev)
      next.delete(sessionName)
      return next
    })
  }, [])

  /** Clear the entire restart queue — no pending agents will be restarted. */
  const cancelAll = useCallback(() => {
    setQueue(new Map())
  }, [])

  // Core polling effect: when the queue changes, check each queued agent via the ref.
  // Uses a 1s interval to poll the ref (avoids re-running on every WebSocket activity event).
  // When a queued agent's notificationType becomes 'idle_prompt', fire the restart API.
  useEffect(() => {
    if (queue.size === 0) return

    const checkQueue = () => {
      for (const [sessionName, req] of queue) {
        // Skip if already restarting
        if (activeRestartsRef.current.has(sessionName)) continue

        const info = getSessionActivityRef.current(sessionName)
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
    }

    // Check immediately, then poll every 1s (avoids depending on getSessionActivity identity)
    checkQueue()
    const interval = setInterval(checkQueue, 1000)
    return () => clearInterval(interval)
  }, [queue])

  return {
    queueRestart,
    queueRestartAll,
    cancelRestart,
    cancelAll,
    pendingCount: queue.size,
    pendingSessions: Array.from(queue.keys()),
  }
}
