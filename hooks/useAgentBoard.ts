'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { Host } from '@/types/host'
import { isSelfHost } from '@/lib/host-kind'
import { cardUrl, dedupeCards, fetchSharedCards } from '@/lib/task-client'
import type { TaskUpdates, CommentResult } from '@/hooks/useTasks'

/**
 * One agent's board: its own cards plus the cards of its teams assigned to it.
 * `hostUrl` is the host the agent lives on ('' = this host). Every call goes to that host: a host
 * that does not own the agent has no cards for it, and a wrong host looks like an empty board.
 */
/** A card with the host that holds it, set for project cards (their project can be on any host) */
export type BoardCard = TaskWithDeps & { hostBase?: string }

export function useAgentBoard(agentId: string | null, hostUrl: string = '', hosts: Host[] = [], aliases: string[] = []) {
  const [tasks, setTasks] = useState<BoardCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBoard = useCallback(async () => {
    if (!agentId) return
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/board`, { signal: AbortSignal.timeout(10000) })
      if (res.status === 404) throw new Error('This host does not know this agent')
      if (!res.ok) throw new Error('Could not load the board')
      const data = await res.json()
      // Project cards for this agent: a project is stored on its owner's host, which may not be this agent's,
      // so every host is asked. A host that does not answer simply adds nothing.
      const targets = hosts.length > 0 ? hosts.filter(h => h.enabled !== false) : [{ id: 'local', name: 'This host', url: '', isSelf: true } as Host]
      const projectCards = (await Promise.all(targets.map(async host => {
        const base = isSelfHost(host) ? '' : host.url.replace(/\/$/, '')
        try {
          const r = await fetch(`${base}/api/projects?assignee=${encodeURIComponent(agentId)}`, { signal: AbortSignal.timeout(6000) })
          if (!r.ok) return []
          const d = await r.json()
          return ((d.projects || []) as Array<{ cards?: TaskWithDeps[] }>).flatMap(p => (p.cards || []).map(c => ({ ...c, hostBase: base })))
        } catch {
          return []
        }
      }))).flat()
      // Cards on OTHER hosts that list this agent as a co-owner: the agent's own host already put its local ones in
      // `data.cards`, so it is not asked again. A host that does not answer adds nothing. The names let a host
      // that does not know the agent match an owner given by name.
      const sharedCards = await fetchSharedCards(agentId, aliases, targets.map(h => (isSelfHost(h) ? '' : h.url.replace(/\/$/, ''))), hostUrl)
      // The same card id can come from more than one answer: it is listed once, the board's own copy first
      setTasks(dedupeCards([...(data.cards || []), ...projectCards, ...sharedCards]))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The host is offline or out of reach')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, hostUrl, aliases.join(','), hosts.map(h => `${h.id}|${h.url}|${h.enabled}`).join(',')])

  useEffect(() => {
    if (!agentId) { setTasks([]); return }
    setLoading(true)
    fetchBoard().finally(() => setLoading(false))
    const timer = setInterval(fetchBoard, 5000)
    return () => clearInterval(timer)
  }, [agentId, fetchBoard])

  // A card is changed through the API of the board it lives on
  const base = useCallback((task: BoardCard) =>
    // A card shared with this agent stays on the board it was made on, on the host that holds it
    task.shared
      ? cardUrl(task.hostBase ?? hostUrl, { id: task.id, scope: task.scope, teamId: task.teamId, projectId: task.projectId, ownerAgentId: task.ownerAgentId })
      : task.scope === 'project' && task.projectId
      ? cardUrl(task.hostBase ?? '', { id: task.id, scope: 'project', projectId: task.projectId })
      : task.scope === 'team' && task.teamId
        ? `${hostUrl}/api/teams/${task.teamId}/tasks/${task.id}`
        : `${hostUrl}/api/agents/${agentId}/tasks/${task.id}`, [agentId, hostUrl])

  const createTask = useCallback(async (data: { subject: string; description?: string; blockedBy?: string[]; priority?: number }) => {
    if (!agentId) return
    // A new card goes on the agent's own board; sharing work with others is a team (or project) card
    const res = await fetch(`${hostUrl}/api/agents/${agentId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: data.subject, description: data.description, blockedBy: data.blockedBy, priority: data.priority }),
    })
    if (!res.ok) throw new Error('Failed to create task')
    await fetchBoard()
  }, [agentId, hostUrl, fetchBoard])

  const updateTask = useCallback(async (taskId: string, updates: TaskUpdates) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { unblocked: [] as TaskWithDeps[] }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } as TaskWithDeps : t))
    // A card on the agent's own board stays the agent's: the assignee is not sent
    const body = task.scope === 'team' || task.scope === 'project' ? updates : { ...updates, assigneeAgentId: undefined }
    const res = await fetch(base(task), {
      method: task.scope === 'team' || task.scope === 'project' ? 'PUT' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      await fetchBoard()
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail?.message || detail?.error || 'Failed to update task')
    }
    const data = await res.json()
    await fetchBoard()
    return { unblocked: data.unblocked || [] }
  }, [tasks, base, fetchBoard])

  const deleteTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setTasks(prev => prev.filter(t => t.id !== taskId))
    const res = await fetch(base(task), { method: 'DELETE' })
    if (!res.ok) {
      await fetchBoard()
      throw new Error('Failed to delete task')
    }
  }, [tasks, base, fetchBoard])

  const addComment = useCallback(async (task: TaskWithDeps, text: string, deliver: boolean): Promise<CommentResult> => {
    const res = await fetch(`${base(task)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: { kind: 'operator' }, text, deliver }),
    })
    if (!res.ok) throw new Error('Could not save the comment')
    const data = await res.json()
    await fetchBoard()
    return { delivered: data.delivered, reason: data.reason }
  }, [base, fetchBoard])

  const retryComment = useCallback(async (task: TaskWithDeps, commentId: string): Promise<CommentResult> => {
    const res = await fetch(`${base(task)}/comments/${commentId}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    await fetchBoard()
    return { delivered: data.delivered, reason: data.reason }
  }, [base, fetchBoard])

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskWithDeps[]> = { backlog: [], pending: [], in_progress: [], review: [], waiting: [], completed: [] }
    tasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [tasks])

  return { tasks, tasksByStatus, loading, error, createTask, updateTask, deleteTask, addComment, retryComment, refresh: fetchBoard }
}
