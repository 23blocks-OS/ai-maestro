'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export interface UseConfigUndoRedoReturn {
  undo: () => void
  redo: () => void
  refreshStatus: () => void
  undoCount: number
  redoCount: number
  canUndo: boolean
  canRedo: boolean
  isLoading: boolean
  // Compatibility with old hook interface
  clearStacks: () => void
  pushChange: (entry: any) => Promise<void>
}

export function useConfigUndoRedo(): UseConfigUndoRedoReturn {
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/config/undo-status')
      if (res.ok && mountedRef.current) {
        const data = await res.json()
        setUndoCount(data.undoCount)
        setRedoCount(data.redoCount)
      }
    } catch {}
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    // Listen for undo/redo events from other components
    const handler = () => refreshStatus()
    window.addEventListener('config-undo-redo', handler)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
      window.removeEventListener('config-undo-redo', handler)
    }
  }, [refreshStatus])

  const undo = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/config/undo', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setUndoCount(data.undoCount)
        setRedoCount(data.redoCount)
        window.dispatchEvent(new CustomEvent('config-undo-redo'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const redo = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/config/redo', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setUndoCount(data.undoCount)
        setRedoCount(data.redoCount)
        window.dispatchEvent(new CustomEvent('config-undo-redo'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Compatibility stubs — server handles everything now
  const clearStacks = useCallback(() => refreshStatus(), [refreshStatus])
  const pushChange = useCallback(async () => { await refreshStatus() }, [refreshStatus])

  return {
    undo, redo, refreshStatus, clearStacks, pushChange,
    undoCount, redoCount,
    canUndo: undoCount > 0 && !isLoading,
    canRedo: redoCount > 0 && !isLoading,
    isLoading,
  }
}
