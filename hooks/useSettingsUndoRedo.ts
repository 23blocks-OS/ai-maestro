'use client'

import { useCallback } from 'react'
import { useUndoRedo, type UndoRedoEntry, type UseUndoRedoReturn } from './useUndoRedo'

// ---------------------------------------------------------------------------
// Settings-specific undo/redo — thin wrapper around the generic useUndoRedo hook.
// Handles plugin enable/disable toggles and other settings page operations.
// ---------------------------------------------------------------------------

export type UseSettingsUndoRedoReturn = UseUndoRedoReturn

/**
 * Settings-specific undo/redo hook.
 *
 * Supports:
 * - `plugin:toggle` — enable/disable a plugin via POST /api/settings/marketplaces
 *   The entry.oldValue/newValue store the boolean enabled state.
 *   The entry.reverseBody stores { action: 'enable'|'disable', pluginKey: string }.
 *
 * For other settings operations, provide `endpoint`, `method`, and `reverseBody`.
 */
export function useSettingsUndoRedo(): UseSettingsUndoRedoReturn {

  // Settings-specific persistence: route to the correct API based on the field type
  const persistFn = useCallback(async (field: string, value: any, entry: UndoRedoEntry): Promise<boolean> => {
    // Plugin enable/disable toggle
    if (field === 'plugin:toggle') {
      const action = value ? 'enable' : 'disable'
      const pluginKey = entry.reverseBody?.pluginKey
      if (!pluginKey) return false
      try {
        const res = await fetch('/api/settings/marketplaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, pluginKey }),
        })
        return res.ok
      } catch (error) {
        console.error(`[useSettingsUndoRedo] Plugin toggle failed for ${pluginKey}:`, error)
        return false
      }
    }

    // Complex operation with explicit endpoint/method
    if (entry.endpoint && entry.method) {
      try {
        const body = entry.reverseBody ?? { value }
        const res = await fetch(entry.endpoint, {
          method: entry.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        return res.ok
      } catch (error) {
        console.error(`[useSettingsUndoRedo] API call failed for ${field}:`, error)
        return false
      }
    }

    console.warn(`[useSettingsUndoRedo] Unknown field type: ${field}`)
    return false
  }, [])

  return useUndoRedo(persistFn)
}
