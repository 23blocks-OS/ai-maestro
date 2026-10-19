'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { TaskUpdates, CommentResult } from '@/hooks/useTasks'

/**
 * One agent's board: its own cards plus the cards of its teams assigned to it.
 * `hostUrl` is the host the agent lives on ('' = this host). Every call goes to that host: a host
 * that does not own the agent has no cards for it, and a wrong host looks like an empty board.
 */
export function useAgentBoard(agentId: string | null, hostUrl: string = '') {
  const [tasks, setTasks] = useState<TaskWithDeps[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBoard = useCallback(async () => {
    if (!agentId) return
    try {
      const res = await fetch(`${hostUrl}/api/agents/${agentId}/board`, { signal: AbortSignal.timeout(10000) })
      if (res.status === 404) throw new Error('This host does not know this agent')
      if (!res.ok) throw new Error('Could not load the board')
      const data = await res.json()
      setTasks(data.cards || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The host is offline or out of reach')
    }
  }, [agentId, hostUrl])

  useEffect(() => {
    if (!agentId) { setTasks([]); return }
    setLoading(true)
    fetchBoard().finally(() => setLoading(false))
    const timer = setInterval(fetchBoard, 5000)
    return () => clearInterval(timer)
  }, [agentId, fetchBoard])

  // A card is changed through the API of the board it lives on
  const base = useCallback((task: TaskWithDeps) =>
    task.scope === 'team' && task.teamId
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
    const body = task.scope === 'team' ? updates : { ...updates, assigneeAgentId: undefined }
    const res = await fetch(base(task), {
      method: task.scope === 'team' ? 'PUT' : 'PATCH',
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
