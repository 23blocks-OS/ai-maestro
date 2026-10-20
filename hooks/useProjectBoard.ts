'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { TaskUpdates, CommentResult } from '@/hooks/useTasks'
import { commentOnCard, deleteCard, patchCard, retryCardComment } from '@/lib/task-client'

/**
 * One project's board. `hostBase` is the host that STORES the project ('' for this host): every call goes
 * there, whichever hosts the assigned agents live on.
 */
export function useProjectBoard(projectId: string | null, hostBase: string) {
  const [tasks, setTasks] = useState<TaskWithDeps[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBoard = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`${hostBase}/api/projects/${projectId}/tasks`, { signal: AbortSignal.timeout(10000) })
      if (res.status === 404) throw new Error('This project no longer exists on its host')
      if (!res.ok) throw new Error('Could not load the project')
      const data = await res.json()
      setTasks(data.tasks || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The host is offline or out of reach')
    }
  }, [projectId, hostBase])

  useEffect(() => {
    if (!projectId) { setTasks([]); return }
    setLoading(true)
    fetchBoard().finally(() => setLoading(false))
    const timer = setInterval(fetchBoard, 5000)
    return () => clearInterval(timer)
  }, [projectId, fetchBoard])

  const ref = useCallback((t: TaskWithDeps) => ({ id: t.id, scope: 'project' as const, projectId: projectId || undefined }), [projectId])

  const createTask = useCallback(async (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number }) => {
    if (!projectId) return
    const res = await fetch(`${hostBase}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create the card')
    await fetchBoard()
  }, [projectId, hostBase, fetchBoard])

  const updateTask = useCallback(async (taskId: string, updates: TaskUpdates) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { unblocked: [] as TaskWithDeps[] }
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } as TaskWithDeps : t)))
    try {
      await patchCard(hostBase, ref(task), updates)
    } catch (err) {
      await fetchBoard()
      throw err
    }
    await fetchBoard()
    return { unblocked: [] as TaskWithDeps[] }
  }, [tasks, hostBase, ref, fetchBoard])

  const deleteTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    setTasks(prev => prev.filter(t => t.id !== taskId))
    try { await deleteCard(hostBase, ref(task)) } catch (err) { await fetchBoard(); throw err }
  }, [tasks, hostBase, ref, fetchBoard])

  const addComment = useCallback(async (task: TaskWithDeps, text: string, deliver: boolean): Promise<CommentResult> => {
    const r = await commentOnCard(hostBase, ref(task), text, deliver)
    await fetchBoard()
    return r
  }, [hostBase, ref, fetchBoard])

  const retryComment = useCallback(async (task: TaskWithDeps, commentId: string): Promise<CommentResult> => {
    const r = await retryCardComment(hostBase, ref(task), commentId)
    await fetchBoard()
    return r
  }, [hostBase, ref, fetchBoard])

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskWithDeps[]> = { backlog: [], pending: [], in_progress: [], review: [], waiting: [], completed: [] }
    tasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [tasks])

  return { tasks, tasksByStatus, loading, error, createTask, updateTask, deleteTask, addComment, retryComment, refresh: fetchBoard }
}
