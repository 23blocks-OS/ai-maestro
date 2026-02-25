'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import ToastContainer from '@/components/ToastContainer'

export type ToastType = 'error' | 'success' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  error: 5000,
  success: 3000,
  warning: 4000,
  info: 3500,
}

const MAX_TOASTS = 5

let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((input: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => {
    const id = `toast-${++toastCounter}`
    const duration = input.duration ?? DEFAULT_DURATIONS[input.type]
    const toast: Toast = { ...input, id, duration }

    setToasts(prev => {
      const next = [...prev, toast]
      // Remove oldest if exceeding max
      if (next.length > MAX_TOASTS) {
        const removed = next.shift()!
        const timer = timersRef.current.get(removed.id)
        if (timer) {
          clearTimeout(timer)
          timersRef.current.delete(removed.id)
        }
      }
      return next
    })

    // Auto-dismiss
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
    timersRef.current.set(id, timer)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
