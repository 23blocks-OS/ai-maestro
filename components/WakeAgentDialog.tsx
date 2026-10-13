'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play } from 'lucide-react'
import LaunchChoicePanel from './launch/LaunchChoicePanel'
import { useLaunchChoice } from '@/hooks/useLaunchChoice'
import type { AgentPermissionMode } from '@/types/agent'
import type { WakeChoiceOptions } from '@/lib/wake-request'
import { MODE_SUMMARY } from '@/lib/freedom'
import type { LaunchOptions } from '@/lib/launch-options'

interface WakeAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  /**
   * `program` is the tool to start, or '' to keep the agent's own program untouched (a wrapper script,
   * or a tool this dialog no longer offers). `options` always carries the permission mode that was
   * chosen, including "supervised": the server falls back to the stored mode when none is sent.
   */
  onConfirm: (program: string, options?: WakeChoiceOptions & { permissionMode?: AgentPermissionMode }) => void
  agentName: string
  agentAlias?: string
  defaultPermissionMode?: AgentPermissionMode
  /** The agent's own program. The dialog starts on it (it used to always start on Claude Code). */
  defaultProgram?: string
  /** The options remembered on the agent (model, effort, continue...). */
  defaultLaunchOptions?: LaunchOptions
}

export default function WakeAgentDialog({
  isOpen,
  onClose,
  onConfirm,
  agentName,
  agentAlias,
  defaultPermissionMode,
  defaultProgram,
  defaultLaunchOptions,
}: WakeAgentDialogProps) {
  const c = useLaunchChoice({ defaultProgram, defaultPermissionMode, defaultLaunchOptions, resetKey: isOpen })
  const [remember, setRemember] = useState(true)
  const [isWaking, setIsWaking] = useState(false)
  const [mounted, setMounted] = useState(false)

  const displayName = agentAlias || agentName

  useEffect(() => {
    setMounted(true)
  }, [])

  // A fresh dialog, or a different agent: remember is back on, and nothing is waking.
  useEffect(() => {
    setRemember(true)
    setIsWaking(false)
  }, [isOpen, defaultProgram])

  const { selected, selectedId, modes, decls, clean, preview, permissionMode, execMode } = c

  const handleConfirm = () => {
    setIsWaking(true)
    onConfirm(selectedId === 'current' ? '' : selected.id, {
      permissionMode: modes.length > 0 ? permissionMode : undefined,
      execMode: selected.kind === 'claude' ? execMode : undefined,
      launchOptions: decls.length > 0 ? clean : undefined,
      remember,
    })
    // The dialog is closed by the parent once the wake finishes.
  }

  if (!mounted) return null

  const dialogContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden w-full max-w-md max-h-[92vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid="wake-dialog"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Play className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">Wake Agent</h2>
                    <p className="text-sm text-zinc-400">{displayName}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                <LaunchChoicePanel c={c} displayName={displayName} disabled={isWaking} withExecMode />

                {/* Remember */}
                {selectedId !== 'current' && (
                  <label className="px-6 pb-3 flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-zinc-600" />
                    Remember this for {displayName}
                  </label>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
                {preview && (
                  <p className="text-[11px] mb-1.5 text-zinc-500 break-all max-h-16 overflow-y-auto" data-testid="wake-preview">
                    Will run: <code className="text-zinc-300 font-mono">{preview}</code>
                  </p>
                )}
                <p className={`text-[11px] mb-3 ${modes.length > 0 && permissionMode === 'fullAutonomy' ? 'text-red-300' : 'text-zinc-500'}`} data-testid="wake-summary">
                  {selectedId === 'current'
                    ? `${displayName} will keep running ${defaultProgram}.`
                    : `${displayName} will start ${selected.name}${modes.length > 0 ? `, ${MODE_SUMMARY[permissionMode]}` : ''}.`}
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isWaking}
                    className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isWaking ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Waking...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Wake Agent
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(dialogContent, document.body)
}
