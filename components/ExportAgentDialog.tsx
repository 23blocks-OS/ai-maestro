'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Package, FileArchive, Check, AlertCircle, Sparkles, Database, Mail, GitBranch, FileText, FolderArchive } from 'lucide-react'

interface ExportAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  agentAlias: string
  agentDisplayName?: string
}

type ExportPhase = 'idle' | 'packing' | 'zipping' | 'ready' | 'error'

const PACKING_MESSAGES = [
  "Gathering memories... 🧠",
  "Packing the personality modules...",
  "Rolling up the conversation history...",
  "Don't forget the config files!",
  "Collecting all the bits and bytes...",
]

const ZIPPING_MESSAGES = [
  "Compressing with care... 📦",
  "Making everything nice and tidy...",
  "Adding a bow on top...",
  "Almost there...",
  "Sealing the package...",
]

const READY_MESSAGES = [
  "All packed and ready! 🎁",
  "Your agent is ready to travel!",
  "Download me, I'm adorable!",
  "Ready for new adventures!",
]

const ITEMS_TO_PACK = [
  { icon: Database, label: 'Memory', color: 'text-blue-400' },
  { icon: Mail, label: 'Messages', color: 'text-green-400' },
  { icon: GitBranch, label: 'Repos', color: 'text-purple-400' },
  { icon: FileText, label: 'Config', color: 'text-orange-400' },
]

export default function ExportAgentDialog({
  isOpen,
  onClose,
  agentId,
  agentAlias,
  agentDisplayName,
}: ExportAgentDialogProps) {
  const [phase, setPhase] = useState<ExportPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleExport = async () => {
    setPhase('packing')
    setProgress(0)
    setError(null)

    // Simulate packing progress
    const packingInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 8, 40))
    }, 150)

    try {
      // Transition to zipping
      setTimeout(() => {
        clearInterval(packingInterval)
        setPhase('zipping')
        setProgress(50)
      }, 1200)

      const response = await fetch(`/api/agents/${agentId}/export`)

      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)

      // Complete zipping animation
      setProgress(90)
      await new Promise(resolve => setTimeout(resolve, 500))

      setPhase('ready')
      setProgress(100)

    } catch (err) {
      clearInterval(packingInterval)
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const handleDownload = () => {
    if (!downloadUrl) return

    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `${agentAlias || agentId}-export.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Close after download
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl)
      onClose()
      setPhase('idle')
      setDownloadUrl(null)
    }, 500)
  }

  const handleClose = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
    }
    onClose()
    setPhase('idle')
    setDownloadUrl(null)
  }

  const getMessage = () => {
    const messages = phase === 'packing' ? PACKING_MESSAGES
      : phase === 'zipping' ? ZIPPING_MESSAGES
      : phase === 'ready' ? READY_MESSAGES
      : []

    if (messages.length === 0) return ''
    const index = Math.floor((progress / 100) * messages.length)
    return messages[Math.min(index, messages.length - 1)]
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-md mx-4 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden"
        >
          {/* Animated glow background */}
          {phase !== 'idle' && (
            <motion.div
              className={`absolute inset-0 blur-3xl opacity-30 ${
                phase === 'error' ? 'bg-red-500/20'
                : phase === 'ready' ? 'bg-green-500/20'
                : 'bg-blue-500/20'
              }`}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}

          <div className="relative p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  phase === 'ready' ? 'bg-green-500/20' : 'bg-blue-500/20'
                }`}>
                  {phase === 'ready' ? (
                    <FolderArchive className="w-5 h-5 text-green-400" />
                  ) : (
                    <Download className="w-5 h-5 text-blue-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Export Agent</h2>
                  <p className="text-sm text-gray-400">{agentDisplayName || agentAlias}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Animation Area */}
            <div className="h-48 flex items-center justify-center mb-6">
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <IdleAnimation key="idle" />
                )}
                {phase === 'packing' && (
                  <PackingAnimation key="packing" />
                )}
                {phase === 'zipping' && (
                  <ZippingAnimation key="zipping" />
                )}
                {phase === 'ready' && (
                  <ReadyAnimation key="ready" />
                )}
                {phase === 'error' && (
                  <ErrorAnimation key="error" />
                )}
              </AnimatePresence>
            </div>

            {/* Status Message */}
            {phase !== 'idle' && (
              <motion.div
                key={getMessage()}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-6"
              >
                <span className={`text-sm font-medium ${
                  phase === 'error' ? 'text-red-400'
                  : phase === 'ready' ? 'text-green-400'
                  : 'text-blue-400'
                }`}>
                  {phase === 'error' ? error : getMessage()}
                </span>
              </motion.div>
            )}

            {/* Progress Bar */}
            {phase !== 'idle' && phase !== 'error' && phase !== 'ready' && (
              <div className="mb-6">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              {phase === 'idle' && (
                <>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all font-medium flex items-center gap-2"
                  >
                    <Package className="w-4 h-4" />
                    Start Export
                  </button>
                </>
              )}
              {phase === 'ready' && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                  onClick={handleDownload}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all font-medium flex items-center gap-2 shadow-lg shadow-green-500/25"
                >
                  <Download className="w-5 h-5" />
                  Download Package
                </motion.button>
              )}
              {phase === 'error' && (
                <>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleExport}
                    className="px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-500 transition-all font-medium flex items-center gap-2"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// Idle state - waiting to start
function IdleAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="text-6xl">🤖</div>
      <p className="text-gray-400 text-center max-w-xs">
        Ready to pack up this agent for transport or backup
      </p>
    </motion.div>
  )
}

// Packing animation - items flying into box
function PackingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full h-full flex items-center justify-center"
    >
      {/* Box */}
      <motion.div
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative z-10"
      >
        <Package className="w-20 h-20 text-blue-400" strokeWidth={1.5} />
      </motion.div>

      {/* Items flying in */}
      {ITEMS_TO_PACK.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{
            x: 120 * Math.cos((index * Math.PI * 2) / ITEMS_TO_PACK.length + Math.PI / 4),
            y: 120 * Math.sin((index * Math.PI * 2) / ITEMS_TO_PACK.length + Math.PI / 4),
            opacity: 0,
            scale: 0,
          }}
          animate={{
            x: 0,
            y: 0,
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0.3],
          }}
          transition={{
            duration: 1.5,
            delay: index * 0.25,
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
          className="absolute"
        >
          <item.icon className={`w-6 h-6 ${item.color}`} />
        </motion.div>
      ))}
    </motion.div>
  )
}

// Zipping animation - box being sealed
function ZippingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex items-center justify-center"
    >
      <motion.div
        animate={{
          scale: [1, 0.95, 1],
          rotate: [0, -2, 2, 0],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
        }}
      >
        <FileArchive className="w-24 h-24 text-purple-400" strokeWidth={1.5} />
      </motion.div>

      {/* Sparkles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1, 0],
            opacity: [0, 1, 0],
            x: (Math.random() - 0.5) * 100,
            y: (Math.random() - 0.5) * 100,
          }}
          transition={{
            duration: 1,
            delay: i * 0.2,
            repeat: Infinity,
          }}
          className="absolute text-yellow-400"
        >
          <Sparkles className="w-4 h-4" />
        </motion.div>
      ))}
    </motion.div>
  )
}

// Ready animation - package complete with celebration
function ReadyAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center gap-4"
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 10 }}
        className="relative"
      >
        <FolderArchive className="w-20 h-20 text-green-400" strokeWidth={1.5} />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center"
        >
          <Check className="w-5 h-5 text-white" />
        </motion.div>
      </motion.div>

      {/* Confetti */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -100 - Math.random() * 50,
            x: (Math.random() - 0.5) * 200,
            opacity: 0,
            rotate: Math.random() * 360,
          }}
          transition={{
            duration: 1.5,
            delay: 0.2 + Math.random() * 0.3,
          }}
          className="absolute text-2xl"
        >
          {['🎉', '✨', '🎊', '⭐'][Math.floor(Math.random() * 4)]}
        </motion.div>
      ))}
    </motion.div>
  )
}

// Error animation
function ErrorAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4"
    >
      <motion.div
        animate={{ rotate: [0, -5, 5, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
      >
        <AlertCircle className="w-16 h-16 text-red-400" />
      </motion.div>
      <p className="text-gray-400 text-center">
        Oops! Something went wrong
      </p>
    </motion.div>
  )
}
