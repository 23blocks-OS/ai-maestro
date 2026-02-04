'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ExportType, ExportJob, ExportJobStatus, ExportOptions } from '@/types/export'

/**
 * Polling interval for export job progress (in milliseconds)
 */
const EXPORT_POLL_INTERVAL_MS = 1000

/**
 * Maximum polling duration before giving up (in milliseconds)
 */
const EXPORT_MAX_POLL_DURATION_MS = 300000 // 5 minutes

/**
 * Hook for managing transcript exports
 *
 * Handles export job creation, progress tracking, and status polling
 * for long-running transcript export operations.
 *
 * @param agentId - Agent ID to export from
 */
export function useTranscriptExport(agentId: string) {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  // Refs for polling timers and tracking
  const pollTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const isMountedRef = useRef(true)

  /**
   * Load existing export jobs for the agent
   */
  const loadJobs = useCallback(async () => {
    try {
      console.log(`[useTranscriptExport] Loading jobs for agent ${agentId}`)

      // For now, we only track active jobs in state
      // Future: Load from database or file system
      setJobs([])
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useTranscriptExport] Failed to load jobs:', err)
      setError(err instanceof Error ? err : new Error('Failed to load export jobs'))
    }
  }, [agentId])

  /**
   * Create a new export job
   */
  const exportTranscript = useCallback(async (
    format: ExportType,
    options: Partial<ExportOptions> = {}
  ) => {
    setLoading(true)
    setError(null)

    try {
      console.log(`[useTranscriptExport] Creating export job for agent ${agentId}, format: ${format}`)

      const exportRequest = {
        agentId,
        format,
        ...options
      }

      const response = await fetch(`/api/agents/${agentId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(exportRequest)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success || !data.job) {
        throw new Error('Failed to create export job')
      }

      const newJob: ExportJob = data.job

      if (!isMountedRef.current) return

      setJobs(prev => [...prev, newJob])
      setActiveJobId(newJob.id)

      // Start polling for job progress
      startPolling(newJob.id)

      console.log(`[useTranscriptExport] Created export job ${newJob.id}`)
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useTranscriptExport] Failed to create export job:', err)
      setError(err instanceof Error ? err : new Error('Failed to create export job'))
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [agentId])

  /**
   * Start polling for a specific export job's progress
   */
  const startPolling = useCallback((jobId: string) => {
    if (pollTimersRef.current[jobId]) {
      clearInterval(pollTimersRef.current[jobId])
    }

    const startTime = Date.now()

    const pollInterval = setInterval(async () => {
      // Check max duration
      if (Date.now() - startTime > EXPORT_MAX_POLL_DURATION_MS) {
        clearInterval(pollInterval)
        delete pollTimersRef.current[jobId]
        console.warn(`[useTranscriptExport] Polling timeout for job ${jobId}`)
        return
      }

      try {
        const response = await fetch(`/api/export/jobs/${jobId}`)

        if (!response.ok) {
          clearInterval(pollInterval)
          delete pollTimersRef.current[jobId]
          return
        }

        const data = await response.json()

        if (!isMountedRef.current) return

        setJobs(prev => {
          return prev.map(job => {
            if (job.id === jobId) {
              return { ...job, ...data.job }
            }
            return job
          })
        })

        // Stop polling if job is completed or failed
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          clearInterval(pollInterval)
          delete pollTimersRef.current[jobId]
          setActiveJobId(null)
          console.log(`[useTranscriptExport] Job ${jobId} finished with status ${data.job.status}`)
        }
      } catch (err) {
        console.error(`[useTranscriptExport] Failed to poll job ${jobId}:`, err)
        clearInterval(pollInterval)
        delete pollTimersRef.current[jobId]
      }
    }, EXPORT_POLL_INTERVAL_MS)

    pollTimersRef.current[jobId] = pollInterval
  }, [])

  /**
   * Cancel an export job
   */
  const cancelJob = useCallback(async (jobId: string) => {
    try {
      console.log(`[useTranscriptExport] Cancelling job ${jobId}`)

      const response = await fetch(`/api/export/jobs/${jobId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      if (!isMountedRef.current) return

      // Stop polling if active
      if (pollTimersRef.current[jobId]) {
        clearInterval(pollTimersRef.current[jobId])
        delete pollTimersRef.current[jobId]
      }

      // Remove job from list
      setJobs(prev => prev.filter(job => job.id !== jobId))

      if (activeJobId === jobId) {
        setActiveJobId(null)
      }

      console.log(`[useTranscriptExport] Cancelled job ${jobId}`)
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useTranscriptExport] Failed to cancel job:', err)
      setError(err instanceof Error ? err : new Error('Failed to cancel export job'))
    }
  }, [activeJobId])

  /**
   * Clear completed or failed jobs
   */
  const clearCompletedJobs = useCallback(() => {
    setJobs(prev => prev.filter(job => 
      job.status === 'pending' || job.status === 'processing'
    ))
  }, [])

  /**
   * Get job by ID
   */
  const getJob = useCallback((jobId: string): ExportJob | undefined => {
    return jobs.find(job => job.id === jobId)
  }, [jobs])

  /**
   * Get jobs by status
   */
  const getJobsByStatus = useCallback((status: ExportJobStatus): ExportJob[] => {
    return jobs.filter(job => job.status === status)
  }, [jobs])

  /**
   * Get active jobs (pending or processing)
   */
  const getActiveJobs = useCallback((): ExportJob[] => {
    return jobs.filter(job => 
      job.status === 'pending' || job.status === 'processing'
    )
  }, [jobs])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false

      // Clear all polling timers
      for (const jobId in pollTimersRef.current) {
        clearInterval(pollTimersRef.current[jobId])
      }
      pollTimersRef.current = {}
    }
  }, [])

  /**
   * Load jobs on mount
   */
  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  return {
    // State
    jobs,
    loading,
    error,
    activeJobId,

    // Computed
    activeJobs: getActiveJobs(),

    // Actions
    exportTranscript,
    cancelJob,
    clearCompletedJobs,
    getJob,
    getJobsByStatus,
    getActiveJobs
  }
}
