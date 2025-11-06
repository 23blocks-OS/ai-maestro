'use client'

import { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react'
import type { FitAddon } from '@xterm/addon-fit'

interface TerminalInstance {
  sessionId: string
  fitAddon: FitAddon
  lastActivity: number
  isActive: boolean
}

export type TerminalStatus = 'active' | 'idle' | 'disconnected'

interface TerminalContextType {
  registerTerminal: (sessionId: string, fitAddon: FitAddon) => void
  unregisterTerminal: (sessionId: string) => void
  reportActivity: (sessionId: string) => void
  getTerminalStatus: (sessionId: string) => TerminalStatus
  terminalStatuses: Map<string, TerminalStatus>
}

const TerminalContext = createContext<TerminalContextType | null>(null)

// Consider terminal idle after 3 seconds of no activity
const IDLE_THRESHOLD = 3000

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map())
  const [terminalStatuses, setTerminalStatuses] = useState<Map<string, TerminalStatus>>(new Map())

  const registerTerminal = useCallback((sessionId: string, fitAddon: FitAddon) => {
    const instance: TerminalInstance = {
      sessionId,
      fitAddon,
      lastActivity: Date.now(),
      isActive: true,
    }
    terminalsRef.current.set(sessionId, instance)
    setTerminalStatuses(prev => new Map(prev).set(sessionId, 'active'))
  }, [])

  const unregisterTerminal = useCallback((sessionId: string) => {
    terminalsRef.current.delete(sessionId)
    setTerminalStatuses(prev => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const reportActivity = useCallback((sessionId: string) => {
    const instance = terminalsRef.current.get(sessionId)
    if (instance) {
      instance.lastActivity = Date.now()
      instance.isActive = true
      setTerminalStatuses(prev => {
        const current = prev.get(sessionId)
        if (current !== 'active') {
          return new Map(prev).set(sessionId, 'active')
        }
        return prev
      })
    }
  }, [])

  const getTerminalStatus = useCallback((sessionId: string): TerminalStatus => {
    return terminalStatuses.get(sessionId) || 'disconnected'
  }, [terminalStatuses])

  // Global window resize handler
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout

    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        // Resize all registered terminals
        terminalsRef.current.forEach((instance) => {
          try {
            instance.fitAddon.fit()
          } catch (e) {
            console.warn(`⚠️ [GLOBAL-RESIZE-FIT] Failed to fit terminal for session ${instance.sessionId}:`, e)
          }
        })
      }, 100) // Debounce by 100ms
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [])

  // Activity monitoring - check for idle terminals every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const updates: Array<[string, TerminalStatus]> = []

      terminalsRef.current.forEach((instance) => {
        const timeSinceActivity = now - instance.lastActivity
        const shouldBeIdle = timeSinceActivity > IDLE_THRESHOLD

        if (instance.isActive && shouldBeIdle) {
          instance.isActive = false
          updates.push([instance.sessionId, 'idle'])
        }
      })

      if (updates.length > 0) {
        setTerminalStatuses(prev => {
          const next = new Map(prev)
          updates.forEach(([sessionId, status]) => {
            next.set(sessionId, status)
          })
          return next
        })
      }
    }, 1000) // Check every second

    return () => clearInterval(interval)
  }, [])

  return (
    <TerminalContext.Provider
      value={{
        registerTerminal,
        unregisterTerminal,
        reportActivity,
        getTerminalStatus,
        terminalStatuses,
      }}
    >
      {children}
    </TerminalContext.Provider>
  )
}

export function useTerminalRegistry() {
  const context = useContext(TerminalContext)
  if (!context) {
    throw new Error('useTerminalRegistry must be used within TerminalProvider')
  }
  return context
}
