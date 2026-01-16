'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Terminal, Cpu, Code2, Sparkles, Play } from 'lucide-react'

interface WakeAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (program: string) => void
  agentName: string
  agentAlias?: string
}

const CLI_OPTIONS = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s AI coding assistant',
    icon: Sparkles,
    command: 'claude'
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI\'s Codex command line tool',
    icon: Code2,
    command: 'codex'
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal',
    icon: Terminal,
    command: 'aider'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first code editor',
    icon: Cpu,
    command: 'cursor'
  }
]

export default function WakeAgentDialog({
  isOpen,
  onClose,
  onConfirm,
  agentName,
  agentAlias
}: WakeAgentDialogProps) {
  const [selectedProgram, setSelectedProgram] = useState<string>('claude')
  const [isWaking, setIsWaking] = useState(false)
  const [mounted, setMounted] = useState(false)

  const displayName = agentAlias || agentName

  // Ensure we're mounted on client before using portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleConfirm = () => {
    setIsWaking(true)
    onConfirm(selectedProgram)
    // Dialog will be closed by parent after wake completes
  }

  const handleClose = () => {
    if (!isWaking) {
      setSelectedProgram('claude')
      onClose()
    }
  }

  // Don't render anything on server or before mount
  if (!mounted) return null

  const dialogContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={handleClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
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
                <button
                  onClick={handleClose}
                  disabled={isWaking}
                  className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <p className="text-sm text-zinc-300 mb-4">
                  Select the AI coding assistant to start with this agent:
                </p>

                <div className="space-y-2">
                  {CLI_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const isSelected = selectedProgram === option.id

                    return (
                      <button
                        key={option.id}
                        onClick={() => setSelectedProgram(option.id)}
                        disabled={isWaking}
                        className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            isSelected ? 'bg-emerald-500/20' : 'bg-zinc-700'
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${
                              isSelected ? 'text-emerald-400' : 'text-zinc-400'
                            }`}
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <div
                            className={`font-medium ${
                              isSelected ? 'text-emerald-400' : 'text-zinc-200'
                            }`}
                          >
                            {option.name}
                          </div>
                          <div className="text-xs text-zinc-500">{option.description}</div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-zinc-600'
                          }`}
                        >
                          {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
                <button
                  onClick={handleClose}
                  disabled={isWaking}
                  className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                >
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  // Use portal to render at document body level
  return createPortal(dialogContent, document.body)
}
