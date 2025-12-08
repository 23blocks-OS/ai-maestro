'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2, X, Zap, Skull } from 'lucide-react'

interface DeleteAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  agentId: string
  agentAlias: string
  agentDisplayName?: string
}

export default function DeleteAgentDialog({
  isOpen,
  onClose,
  onConfirm,
  agentId,
  agentAlias,
  agentDisplayName,
}: DeleteAgentDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [phase, setPhase] = useState<'confirm' | 'deleting' | 'done'>('confirm')

  const displayName = agentDisplayName || agentAlias

  const handleDelete = async () => {
    if (confirmText !== agentAlias) return

    setPhase('deleting')
    setDeleting(true)

    try {
      await onConfirm()
      setPhase('done')
      // Auto-close after showing success
      setTimeout(() => {
        onClose()
        // Reset state
        setPhase('confirm')
        setConfirmText('')
        setDeleting(false)
      }, 1500)
    } catch (error) {
      console.error('Failed to delete agent:', error)
      setDeleting(false)
      setPhase('confirm')
    }
  }

  const handleClose = () => {
    if (deleting) return
    onClose()
    setPhase('confirm')
    setConfirmText('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {phase === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Header */}
              <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-red-300">Delete Agent</h3>
                      <p className="text-sm text-gray-400">This action cannot be undone</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <p className="text-sm text-gray-300 mb-3">
                    You are about to permanently delete:
                  </p>
                  <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <div className="font-semibold text-white">{displayName}</div>
                      <div className="text-xs text-gray-400 font-mono">{agentId}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-gray-400">
                    This will delete:
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      All agent configuration and metadata
                    </li>
                    <li className="flex items-center gap-2 text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      Session history and logs
                    </li>
                    <li className="flex items-center gap-2 text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      Associated tmux session (if running)
                    </li>
                  </ul>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type <span className="font-mono text-red-400">{agentAlias}</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={agentAlias}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={confirmText !== agentAlias}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Forever
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'deleting' && (
            <motion.div
              key="deleting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8"
            >
              <DeletingAnimation agentName={displayName} />
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8"
            >
              <DeletedAnimation agentName={displayName} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// Deleting Animation
function DeletingAnimation({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      {/* Pulsing danger zone */}
      <motion.div
        className="absolute inset-0 bg-red-500/10 blur-3xl"
        animate={{
          opacity: [0.2, 0.4, 0.2],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
        }}
      />

      {/* Central animation */}
      <div className="relative">
        {/* Spinning ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-500/30"
          style={{ width: 100, height: 100, marginLeft: -10, marginTop: -10 }}
          animate={{
            rotate: 360,
            borderColor: ['rgba(239, 68, 68, 0.3)', 'rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 0.3)'],
          }}
          transition={{
            rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
            borderColor: { duration: 1, repeat: Infinity },
          }}
        />

        {/* Fading agent emoji */}
        <motion.div
          className="text-6xl relative z-10"
          animate={{
            opacity: [1, 0.5, 1],
            scale: [1, 0.9, 1],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
          }}
        >
          🤖
        </motion.div>

        {/* Lightning bolts */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
            }}
            initial={{
              x: 0,
              y: 0,
              opacity: 0,
              scale: 0,
            }}
            animate={{
              x: Math.cos((i * Math.PI * 2) / 4) * 50,
              y: Math.sin((i * Math.PI * 2) / 4) * 50,
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 0.8,
              delay: i * 0.2,
              repeat: Infinity,
            }}
          >
            <Zap className="w-5 h-5 text-red-400" fill="currentColor" />
          </motion.div>
        ))}
      </div>

      {/* Status text */}
      <motion.div
        className="mt-8 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="text-lg font-medium text-red-400">Deleting {agentName}...</span>
        <p className="text-sm text-gray-500 mt-1">Please wait</p>
      </motion.div>
    </div>
  )
}

// Deleted Animation
function DeletedAnimation({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      {/* Puff of smoke effect */}
      <motion.div
        className="relative"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10 }}
      >
        {/* Smoke particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-4 h-4 rounded-full bg-gray-500/30"
            style={{
              top: '50%',
              left: '50%',
            }}
            initial={{
              x: 0,
              y: 0,
              opacity: 1,
              scale: 0,
            }}
            animate={{
              x: Math.cos((i * Math.PI * 2) / 8) * 60,
              y: Math.sin((i * Math.PI * 2) / 8) * 60 - 20,
              opacity: 0,
              scale: [0, 2, 0],
            }}
            transition={{
              duration: 1,
              ease: 'easeOut',
            }}
          />
        ))}

        {/* Gone indicator */}
        <motion.div
          className="text-6xl"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', damping: 10 }}
        >
          💨
        </motion.div>
      </motion.div>

      {/* Status text */}
      <motion.div
        className="mt-6 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <span className="text-lg font-medium text-gray-300">{agentName} has been deleted</span>
        <p className="text-sm text-gray-500 mt-1">Goodbye, friend</p>
      </motion.div>
    </div>
  )
}
