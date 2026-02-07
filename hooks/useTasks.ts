'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'

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
  updateTask: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[]; priority?: number }) => Promise<{ unblocked: TaskWithDeps[] }>
  deleteTask: (taskId: string) => Promise<void>
  assignTask: (taskId: string, agentId: string | null) => Promise<void>
  refreshTasks: () => Promise<void>
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

  const updateTask = useCallback(async (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[]; priority?: number }) => {
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

  const pendingTasks = useMemo(() => tasks.filter(t => t.status === 'pending'), [tasks])
  const inProgressTasks = useMemo(() => tasks.filter(t => t.status === 'in_progress'), [tasks])
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks])

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskWithDeps[]> = {
      backlog: [],
      pending: [],
      in_progress: [],
      review: [],
      completed: [],
    }
    tasks.forEach(t => {
      map[t.status].push(t)
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
  }
}
