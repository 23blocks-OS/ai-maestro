'use client'

import { useCallback, useEffect } from 'react'
import { useUndoRedo, type UndoRedoEntry, type UseUndoRedoReturn } from './useUndoRedo'

// ---------------------------------------------------------------------------
// Agent-specific undo/redo — thin wrapper around the generic useUndoRedo hook.
// Provides the agent PATCH persistFn and marketplace validation callback.
// ---------------------------------------------------------------------------

// Re-export shared types so existing consumers don't need to change imports
export type { UndoRedoEntry } from './useUndoRedo'

/** Return type alias kept for backward compatibility */
export type UseAgentUndoRedoReturn = UseUndoRedoReturn

/**
 * Agent-specific undo/redo hook.
 *
 * For simple field changes (PATCH to /api/agents/:id), only `field`, `oldValue`,
 * and `newValue` are needed. The hook automatically PATCHes `{ [field]: value }`.
 *
 * For complex operations (plugin install, title change, etc.), provide `endpoint`,
 * `method`, and `reverseBody` so the hook knows how to call the correct API on undo/redo.
 */
export function useAgentUndoRedo(
  agentId: string | null,
  baseUrl: string = ''
): UseAgentUndoRedoReturn {

  // Agent-specific persistence: PATCH to /api/agents/:id for simple fields,
  // or use the entry's endpoint/method/reverseBody for complex operations.
  const persistFn = useCallback(async (field: string, value: any, entry: UndoRedoEntry): Promise<boolean> => {
    if (!agentId) return false

    // Complex operation — use the provided endpoint/method/body
    if (entry.endpoint && entry.method) {
      const body = entry.reverseBody ?? { value }
      try {
        const res = await fetch(`${baseUrl}${entry.endpoint}`, {
          method: entry.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.status === 404) {
          window.alert('Agent or resource no longer exists. Undo history cleared.')
          return false
        }
        return res.ok
      } catch (error) {
        console.error(`[useAgentUndoRedo] API call failed for ${field}:`, error)
        return false
      }
    }

    // Simple field or documentation sub-field — immediate PATCH
    try {
      const body = field.startsWith('documentation.') ? { documentation: value } : { [field]: value }
      const res = await fetch(`${baseUrl}/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.status === 404) {
        window.alert('Agent no longer exists. Undo history cleared.')
        return false
      }
      return res.ok
    } catch (error) {
      console.error(`[useAgentUndoRedo] Save failed for ${field}:`, error)
      return false
    }
  }, [baseUrl, agentId])

  // Marketplace validation — check if a plugin's marketplace still exists before restoring
  const validateBeforeUndo = useCallback(async (entry: UndoRedoEntry): Promise<boolean> => {
    const isPluginRestore = entry.field.startsWith('plugin:') && entry.reverseBody?.marketplaceName
    if (!isPluginRestore) return true

    const marketplaceName = entry.reverseBody.marketplaceName
    try {
      const res = await fetch(`${baseUrl}/api/settings/marketplaces`)
      if (!res.ok) return true // can't check — proceed optimistically
      const data = await res.json()
      const marketplaces = data.marketplaces || []
      const exists = marketplaces.some((m: { name: string }) => m.name === marketplaceName)
      if (!exists) {
        const proceed = window.confirm(
          `The plugin "${entry.reverseBody.pluginName || 'unknown'}" was part of marketplace "${marketplaceName}" ` +
          `which is no longer installed.\n\n` +
          `Do you want to reinstall the marketplace first?\n\n` +
          `• OK = Reinstall marketplace, then restore the plugin\n` +
          `• Cancel = Skip this undo`
        )
        if (!proceed) return false

        try {
          await fetch(`${baseUrl}/api/settings/marketplaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: marketplaceName, action: 'add' })
          })
          console.log(`[useAgentUndoRedo] Reinstalled marketplace: ${marketplaceName}`)
        } catch (err) {
          console.error(`[useAgentUndoRedo] Failed to reinstall marketplace ${marketplaceName}:`, err)
          window.alert(`Failed to reinstall marketplace "${marketplaceName}". Undo cancelled.`)
          return false
        }
      }
    } catch {
      // Network error checking marketplaces — proceed optimistically
    }
    return true
  }, [baseUrl])

  const undoRedo = useUndoRedo(persistFn, validateBeforeUndo)

  // Reset stacks when the agent changes
  useEffect(() => {
    undoRedo.clearStacks()
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  return undoRedo
}
