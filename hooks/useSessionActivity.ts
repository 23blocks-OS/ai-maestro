'use client'

/**
 * Agent status in the browser: ONE store per page, fed by ONE connection.
 *
 * The server's activity feed (GET /api/sessions/activity + the /status
 * WebSocket, hook-driven and normalised, services/sessions-service.ts) is the
 * single source of what every agent is doing. This module is its only reader
 * in the browser: the first component that asks opens the socket, every other
 * component shares the same map, and `presenceOf(agent)` is the one function
 * that turns an agent into Working / Needs you / Ready / Offline.
 *
 * Before this, each component that used this hook opened its own WebSocket and
 * poll, and some views (chat, mobile chat, companion) worked the status out
 * from their own data, so the same agent could read Working in the sidebar and
 * terminal and Ready in the chat.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { presenceFrom, type AgentPresence } from '@/lib/agent-presence'

export type SessionActivityStatus = 'active' | 'idle' | 'waiting'

export interface SessionActivityInfo {
  lastActivity: string
  status: SessionActivityStatus
  hookStatus?: string
  notificationType?: string
}

export type SessionActivityMap = Record<string, SessionActivityInfo>

interface StoreState {
  activity: SessionActivityMap
  loading: boolean
  error: Error | null
  connected: boolean
}

// ── The store (module level: one per page) ──────────────────────────────────

let state: StoreState = { activity: {}, loading: true, error: null, connected: false }
const listeners = new Set<() => void>()
let ws: WebSocket | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let started = false

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

async function fetchActivity() {
  try {
    const response = await fetch('/api/sessions/activity')
    if (response.ok) {
      const data = await response.json()
      setState({ activity: data.activity || {}, loading: false })
    }
  } catch (err) {
    console.error('[useSessionActivity] Poll failed:', err)
  }
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(fetchActivity, 30000) // safety net while the socket is down
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function connect() {
  if (typeof window === 'undefined') return
  if (ws) { try { ws.close() } catch { /* already closed */ } }
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/status`)
    ws = socket
    socket.onopen = () => {
      setState({ connected: true, error: null })
      stopPolling()
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'initial_status') {
          setState({ activity: data.activity || {}, loading: false })
        } else if (data.type === 'status_update') {
          const update: SessionActivityInfo = {
            lastActivity: data.timestamp,
            status: data.status,
            hookStatus: data.hookStatus,
            notificationType: data.notificationType,
          }
          const next = { ...state.activity }
          if (data.sessionName) next[data.sessionName] = update
          // The heartbeat is keyed by agent id only; it must not overwrite a
          // richer session entry with a bare status
          if (data.agentId && (data.sessionName || !next[data.agentId]?.hookStatus || data.hookStatus)) next[data.agentId] = update
          setState({ activity: next })
          window.dispatchEvent(new CustomEvent('agent-activity', {
            detail: { sessionName: data.sessionName, agentId: data.agentId, status: data.status },
          }))
        }
      } catch (err) {
        console.error('[useSessionActivity] Failed to parse message:', err)
      }
    }
    socket.onclose = () => {
      if (ws !== socket) return
      setState({ connected: false })
      startPolling()
      if (started) reconnectTimer = setTimeout(connect, 2000)
    }
    socket.onerror = () => setState({ error: new Error('WebSocket connection failed') })
  } catch (err) {
    setState({ error: err instanceof Error ? err : new Error('Unknown error'), loading: false })
  }
}

function start() {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
  if (started) return
  started = true
  fetchActivity()
  connect()
  startPolling()
}

function stop() {
  // Grace period: views mounting and unmounting (tab switches) keep one socket
  stopTimer = setTimeout(() => {
    if (listeners.size > 0) return
    started = false
    stopPolling()
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { const s = ws; ws = null; try { s.close() } catch { /* closed */ } }
  }, 5000)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

const getSnapshot = () => state
const serverSnapshot: StoreState = { activity: {}, loading: true, error: null, connected: false }
const getServerSnapshot = () => serverSnapshot

// ── Reading it ──────────────────────────────────────────────────────────────

export interface PresenceSubject {
  id?: string
  name?: string
  alias?: string
  session?: { status?: string; tmuxSessionName?: string } | null
  sessions?: Array<{ status?: string }> | null
}

function lookup(activity: SessionActivityMap, sessionName?: string | null, agentId?: string | null): SessionActivityInfo | null {
  return (sessionName ? activity[sessionName] : undefined) || (agentId ? activity[agentId] : undefined) || null
}

/** The one mapping from an agent to its status, used by every view */
export function presenceFromActivity(activity: SessionActivityMap, agent: PresenceSubject, opts: { online?: boolean } = {}): AgentPresence {
  const online = opts.online ?? (agent.session?.status === 'online' || agent.sessions?.[0]?.status === 'online')
  const info = lookup(activity, agent.name || agent.alias || agent.session?.tmuxSessionName, agent.id)
  return presenceFrom({ online, activity: info?.status, hookStatus: info?.hookStatus, notificationType: info?.notificationType })
}

export function useSessionActivity() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const { activity } = snap

  const getSessionActivity = useCallback(
    (sessionName: string, agentId?: string): SessionActivityInfo | null => lookup(activity, sessionName, agentId),
    [activity]
  )
  const isSessionWaiting = useCallback((sessionName: string) => activity[sessionName]?.status === 'waiting', [activity])
  const isSessionActive = useCallback((sessionName: string) => activity[sessionName]?.status === 'active', [activity])
  /** An agent's status, the same everywhere */
  const presenceOf = useCallback(
    (agent: PresenceSubject, opts?: { online?: boolean }) => presenceFromActivity(activity, agent, opts),
    [activity]
  )

  return {
    activity,
    loading: snap.loading,
    error: snap.error,
    connected: snap.connected,
    getSessionActivity,
    isSessionWaiting,
    isSessionActive,
    presenceOf,
    reconnect: connect,
  }
}
