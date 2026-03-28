'use client'

import { createContext, useContext } from 'react'
import type { UseConfigUndoRedoReturn } from './useConfigUndoRedo'

// Context to pass undo/redo down to settings sub-components without prop drilling.
// Separated from page.tsx because Next.js pages cannot have extra named exports.
export const SettingsUndoRedoContext = createContext<UseConfigUndoRedoReturn | null>(null)

/** Hook for sub-components to access the shared settings undo/redo */
export function useSettingsUndoRedoContext(): UseConfigUndoRedoReturn | null {
  return useContext(SettingsUndoRedoContext)
}
