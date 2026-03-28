'use client'

import { useState, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Generic undo/redo hook — FIFO queue + atomic pattern
// Accepts a `persistFn` callback for persistence and an optional
// `validateBeforeUndo` callback for pre-undo checks (e.g., marketplace validation).
// ---------------------------------------------------------------------------

/** Represents a single reversible change */
export interface UndoRedoEntry {
  /** Field name or action type (e.g., 'plugin:enable', 'skill:install') */
  field: string
  /** Value before the change — used to revert on undo */
  oldValue: any
  /** Value after the change — used to reapply on redo */
  newValue: any
  /** API endpoint used for non-simple operations */
  endpoint?: string
  /** HTTP method — defaults to 'PATCH' when omitted */
  method?: string
  /** Request body to send when undoing complex operations */
  reverseBody?: any
}

/** Return type of the useUndoRedo hook */
export interface UseUndoRedoReturn {
  /** Record a new change — persist first (atomic), then push to undo stack */
  pushChange: (entry: UndoRedoEntry) => Promise<void>
  /** Revert the most recent change */
  undo: () => void
  /** Reapply the most recently undone change */
  redo: () => void
  /** Clear both stacks */
  clearStacks: () => void
  /** Number of entries on the undo stack */
  undoCount: number
  /** Number of entries on the redo stack */
  redoCount: number
  /** Whether an undo operation is available */
  canUndo: boolean
  /** Whether a redo operation is available */
  canRedo: boolean
}

/**
 * Callback to persist a field change. Return true if successful, false to abort.
 * For simple changes, `field` and `value` are used.
 * For complex operations, the full entry is available.
 */
export type PersistFn = (field: string, value: any, entry: UndoRedoEntry) => Promise<boolean>

/**
 * Optional callback invoked before undo/redo to validate preconditions.
 * Return true to proceed, false to abort the operation.
 */
export type ValidateBeforeUndoFn = (entry: UndoRedoEntry) => Promise<boolean>

// 10 levels — kept low because Phase 2 will store full file snapshots in SQLite per transaction
const MAX_STACK_SIZE = 10

/**
 * Generic undo/redo hook with FIFO queue and atomic persistence.
 *
 * @param persistFn   - Called to persist changes. Must return true on success.
 * @param validateFn  - Optional. Called before undo/redo to validate preconditions.
 */
export function useUndoRedo(
  persistFn: PersistFn,
  validateFn?: ValidateBeforeUndoFn
): UseUndoRedoReturn {
  const undoStackRef = useRef<UndoRedoEntry[]>([])
  const redoStackRef = useRef<UndoRedoEntry[]>([])
  // Re-render triggers when stack lengths change — drives badge counts & disabled state
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  // FIFO queue ensures changes are persisted in the exact order they occur.
  // Without this, rapid async pushChange calls could resolve out of order.
  const queueRef = useRef<Array<() => Promise<void>>>([])
  const processingRef = useRef(false)

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift()!
      await task()
    }
    processingRef.current = false
  }, [])

  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current.push(task)
    processQueue()
  }, [processQueue])

  const clearStacksInternal = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    queueRef.current = []
    setUndoCount(0)
    setRedoCount(0)
  }, [])

  /**
   * Record a new user-initiated change — ATOMIC: persist first, then push to undo stack.
   * If persist fails, the undo entry is not recorded (change never happened).
   */
  const pushChange = useCallback((entry: UndoRedoEntry): Promise<void> => {
    return new Promise<void>(resolve => {
      enqueue(async () => {
        const saved = await persistFn(entry.field, entry.newValue, entry)
        if (!saved) { resolve(); return }

        undoStackRef.current.push(entry)
        if (undoStackRef.current.length > MAX_STACK_SIZE) undoStackRef.current.shift()
        redoStackRef.current.length = 0
        setUndoCount(undoStackRef.current.length)
        setRedoCount(0)
        resolve()
      })
    })
  }, [persistFn, enqueue])

  /** Undo — queued to preserve ordering with concurrent pushChange calls */
  const undo = useCallback(() => {
    enqueue(async () => {
      if (undoStackRef.current.length === 0) return
      const entry = undoStackRef.current[undoStackRef.current.length - 1]

      // Validate preconditions before proceeding (e.g., marketplace exists)
      if (validateFn) {
        const canProceed = await validateFn(entry)
        if (!canProceed) return
      }

      undoStackRef.current.pop()
      redoStackRef.current.push(entry)
      if (redoStackRef.current.length > MAX_STACK_SIZE) redoStackRef.current.shift()
      await persistFn(entry.field, entry.oldValue, entry)
      setUndoCount(undoStackRef.current.length)
      setRedoCount(redoStackRef.current.length)
    })
  }, [persistFn, validateFn, enqueue])

  /** Redo — queued to preserve ordering */
  const redo = useCallback(() => {
    enqueue(async () => {
      if (redoStackRef.current.length === 0) return
      const entry = redoStackRef.current[redoStackRef.current.length - 1]

      // Validate preconditions before proceeding
      if (validateFn) {
        const canProceed = await validateFn(entry)
        if (!canProceed) return
      }

      redoStackRef.current.pop()
      undoStackRef.current.push(entry)
      if (undoStackRef.current.length > MAX_STACK_SIZE) undoStackRef.current.shift()
      await persistFn(entry.field, entry.newValue, entry)
      setUndoCount(undoStackRef.current.length)
      setRedoCount(redoStackRef.current.length)
    })
  }, [persistFn, validateFn, enqueue])

  return {
    pushChange,
    undo,
    redo,
    clearStacks: clearStacksInternal,
    undoCount,
    redoCount,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  }
}
