'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'

export type TaskUpdates = {
  subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null
  blockedBy?: string[]; priority?: number; waitingOn?: string; waitingNote?: string
  /** true / false when placed on the matrix, null to take it off */
  urgent?: boolean | null; important?: boolean | null
  /** Organization id, or null to go back to the assignee's */
  org?: string | null
  /** A calendar date, YYYY-MM-DD, or null to clear it */
  due?: string | null
  /** The extra owners (agent ids), replacing the list; [] or null clears it */
  owners?: string[] | null
}

export type CommentResult = { delivered?: boolean; reason?: string }

interface UseTasksResult {
  tasks: TaskWithDeps[]
  loading: boolean
  error: string | null
  pendingTasks: TaskWithDeps[]
  inProgressTasks: TaskWithDeps[]
  completedTasks: TaskWithDeps[]
  tasksByStatus: Record<TaskStatus, TaskWithDeps[]>
  tasksByAgent: Record<string, TaskWithDeps[]>
  createTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number }) => Promise<void>
  updateTask: (taskId: string, updates: TaskUpdates) => Promise<{ unblocked: TaskWithDeps[] }>
  deleteTask: (taskId: string) => Promise<void>
  assignTask: (taskId: string, agentId: string | null) => Promise<void>
  refreshTasks: () => Promise<void>
  addComment: (task: TaskWithDeps, text: string, deliver: boolean) => Promise<CommentResult>
  retryComment: (task: TaskWithDeps, commentId: string) => Promise<CommentResult>
}

export function useTasks(teamId: string | null): UseTasksResult {
  const [tasks, setTasks] = useState<TaskWithDeps[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchTasks = useCallback(async () => {
    if (!teamId) return
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks`)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
    }
  }, [teamId])

  // Initial fetch
  useEffect(() => {
    if (!teamId) {
      setTasks([])
      return
    }
    setLoading(true)
    fetchTasks().finally(() => setLoading(false))
  }, [teamId, fetchTasks])

  // Poll every 5s for multi-tab sync
  useEffect(() => {
    if (!teamId) return
    intervalRef.current = setInterval(fetchTasks, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [teamId, fetchTasks])

  const createTask = useCallback(async (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number }) => {
    if (!teamId) return
    const res = await fetch(`/api/teams/${teamId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create task')
    await fetchTasks()
  }, [teamId, fetchTasks])

  const updateTask = useCallback(async (taskId: string, updates: TaskUpdates) => {
    if (!teamId) return { unblocked: [] as TaskWithDeps[] }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t))
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      await fetchTasks() // Revert optimistic update
      throw new Error('Failed to update task')
    }
    const data = await res.json()
    await fetchTasks() // Refresh to get resolved deps
    return { unblocked: data.unblocked || [] }
  }, [teamId, fetchTasks])

  const deleteTask = useCallback(async (taskId: string) => {
    if (!teamId) return
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId))
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}`, { method: 'DELETE' })
    if (!res.ok) {
      await fetchTasks() // Revert
      throw new Error('Failed to delete task')
    }
  }, [teamId, fetchTasks])

  const assignTask = useCallback(async (taskId: string, agentId: string | null) => {
    await updateTask(taskId, { assigneeAgentId: agentId })
  }, [updateTask])

  const addComment = useCallback(async (task: TaskWithDeps, text: string, deliver: boolean): Promise<CommentResult> => {
    if (!teamId) return {}
    const res = await fetch(`/api/teams/${teamId}/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: { kind: 'operator' }, text, deliver }),
    })
    if (!res.ok) throw new Error('Could not save the comment')
    const data = await res.json()
    await fetchTasks()
    return { delivered: data.delivered, reason: data.reason }
  }, [teamId, fetchTasks])

  const retryComment = useCallback(async (task: TaskWithDeps, commentId: string): Promise<CommentResult> => {
    if (!teamId) return {}
    const res = await fetch(`/api/teams/${teamId}/tasks/${task.id}/comments/${commentId}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    await fetchTasks()
    return { delivered: data.delivered, reason: data.reason }
  }, [teamId, fetchTasks])

  const pendingTasks = useMemo(() => tasks.filter(t => t.status === 'pending'), [tasks])
  const inProgressTasks = useMemo(() => tasks.filter(t => t.status === 'in_progress'), [tasks])
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks])

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskWithDeps[]> = {
      backlog: [],
      pending: [],
      in_progress: [],
      review: [],
      waiting: [],
      completed: [],
    }
    tasks.forEach(t => {
      if (map[t.status]) {
        map[t.status].push(t)
      }
    })
    return map
  }, [tasks])

  const tasksByAgent = useMemo(() => {
    const map: Record<string, TaskWithDeps[]> = {}
    tasks.forEach(t => {
      if (t.assigneeAgentId) {
        if (!map[t.assigneeAgentId]) map[t.assigneeAgentId] = []
        map[t.assigneeAgentId].push(t)
      }
    })
    return map
  }, [tasks])

  return {
    tasks,
    loading,
    error,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    tasksByStatus,
    tasksByAgent,
    createTask,
    updateTask,
    deleteTask,
    assignTask,
    refreshTasks: fetchTasks,
    addComment,
    retryComment,
  }
}
