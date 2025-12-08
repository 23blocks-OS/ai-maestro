'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Package, FolderOpen, Check, AlertCircle, Sparkles, Home, Database, Mail, GitBranch, FileText, User } from 'lucide-react'
import type { AgentImportResult } from '@/types/portable'

interface ImportAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: (result: AgentImportResult) => void
}

type ImportPhase = 'idle' | 'unpacking' | 'setting-up' | 'ready' | 'error'

const UNPACKING_MESSAGES = [
  "Opening the package... 📦",
  "Careful with the memories!",
  "Unwrapping personality modules...",
  "Finding all the pieces...",
  "Almost unpacked...",
]

const SETUP_MESSAGES = [
  "Setting up the new home... 🏠",
  "Arranging the furniture...",
  "Connecting the wires...",
  "Running system checks...",
  "Making everything cozy...",
]

const READY_MESSAGES = [
  "Welcome home! 🎉",
  "All systems go!",
  "Ready to get to work!",
  "New agent, who dis?",
]

const ITEMS_UNPACKING = [
  { icon: Database, label: 'Memory', color: 'text-blue-400' },
  { icon: Mail, label: 'Messages', color: 'text-green-400' },
  { icon: GitBranch, label: 'Repos', color: 'text-purple-400' },
  { icon: FileText, label: 'Config', color: 'text-orange-400' },
]

export default function ImportAgentDialog({
  isOpen,
  onClose,
  onImportComplete,
}: ImportAgentDialogProps) {
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AgentImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [cloneRepos, setCloneRepos] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.zip')) {
      setSelectedFile(file)
      setError(null)
    } else {
      setError('Please drop a .zip file')
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setPhase('unpacking')
    setProgress(0)
    setError(null)

    // Animate unpacking
    const unpackInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 40))
    }, 100)

    try {
      // Create form data
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('options', JSON.stringify({
        cloneRepositories: cloneRepos,
      }))

      // Start API call
      const responsePromise = fetch('/api/agents/import', {
        method: 'POST',
        body: formData,
      })

      // Transition to setting up
      setTimeout(() => {
        clearInterval(unpackInterval)
        setPhase('setting-up')
        setProgress(50)
      }, 1500)

      const response = await responsePromise

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Import failed')
      }

      const data: AgentImportResult = await response.json()

      // Complete setup animation
      setProgress(90)
      await new Promise(resolve => setTimeout(resolve, 800))

      setResult(data)
      setPhase('ready')
      setProgress(100)
      onImportComplete?.(data)

    } catch (err) {
      clearInterval(unpackInterval)
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const handleClose = () => {
    onClose()
    // Reset state after animation
    setTimeout(() => {
      setPhase('idle')
      setProgress(0)
      setError(null)
      setResult(null)
      setSelectedFile(null)
    }, 300)
  }

  const getMessage = () => {
    const messages = phase === 'unpacking' ? UNPACKING_MESSAGES
      : phase === 'setting-up' ? SETUP_MESSAGES
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
                : 'bg-purple-500/20'
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
                  phase === 'ready' ? 'bg-green-500/20' : 'bg-purple-500/20'
                }`}>
                  {phase === 'ready' ? (
                    <User className="w-5 h-5 text-green-400" />
                  ) : (
                    <Upload className="w-5 h-5 text-purple-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Import Agent</h2>
                  <p className="text-sm text-gray-400">
                    {phase === 'ready' && result?.agent
                      ? result.agent.alias
                      : selectedFile?.name || 'Upload an agent package'}
                  </p>
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
                  <IdleAnimation
                    key="idle"
                    selectedFile={selectedFile}
                    onFileSelect={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                  />
                )}
                {phase === 'unpacking' && (
                  <UnpackingAnimation key="unpacking" />
                )}
                {phase === 'setting-up' && (
                  <SetupAnimation key="setup" />
                )}
                {phase === 'ready' && (
                  <ReadyAnimation key="ready" agentName={result?.agent?.alias} />
                )}
                {phase === 'error' && (
                  <ErrorAnimation key="error" />
                )}
              </AnimatePresence>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Clone repos option (only in idle phase with file selected) */}
            {phase === 'idle' && selectedFile && (
              <motion.label
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 mb-4 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-all"
              >
                <input
                  type="checkbox"
                  checked={cloneRepos}
                  onChange={e => setCloneRepos(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-200">Clone git repositories</span>
                  <p className="text-xs text-gray-500">Automatically clone repos to local paths</p>
                </div>
              </motion.label>
            )}

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
                  : 'text-purple-400'
                }`}>
                  {phase === 'error' ? error : getMessage()}
                </span>
              </motion.div>
            )}

            {/* Import Stats (on ready) */}
            {phase === 'ready' && result?.stats && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-3 p-3 mb-6 bg-gray-800/50 rounded-lg border border-gray-700"
              >
                <div className="text-center">
                  <div className="text-lg font-bold text-white">
                    {(result.stats.messagesImported?.inbox || 0) + (result.stats.messagesImported?.sent || 0)}
                  </div>
                  <div className="text-xs text-gray-400">Messages</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white">
                    {result.stats.repositoriesCloned || 0}
                  </div>
                  <div className="text-xs text-gray-400">Repos Cloned</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white">
                    {result.stats.databaseImported ? '✓' : '-'}
                  </div>
                  <div className="text-xs text-gray-400">Database</div>
                </div>
              </motion.div>
            )}

            {/* Progress Bar */}
            {phase !== 'idle' && phase !== 'error' && phase !== 'ready' && (
              <div className="mb-6">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
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
                    onClick={handleImport}
                    disabled={!selectedFile}
                    className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import Agent
                  </button>
                </>
              )}
              {phase === 'ready' && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                  onClick={handleClose}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all font-medium flex items-center gap-2 shadow-lg shadow-green-500/25"
                >
                  <Check className="w-5 h-5" />
                  Done
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
                    onClick={() => {
                      setPhase('idle')
                      setError(null)
                    }}
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

// Idle state - drag and drop zone
function IdleAnimation({
  selectedFile,
  onFileSelect,
  onDrop,
}: {
  selectedFile: File | null
  onFileSelect: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full"
    >
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { setIsDragging(false); onDrop(e) }}
        onClick={onFileSelect}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10'
            : selectedFile
              ? 'border-green-500 bg-green-500/10'
              : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
        }`}
      >
        {selectedFile ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <Package className="w-12 h-12 text-green-400" />
            <div>
              <p className="text-sm font-medium text-gray-200">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <FolderOpen className={`w-12 h-12 ${isDragging ? 'text-purple-400' : 'text-gray-500'}`} />
            <div>
              <p className="text-sm font-medium text-gray-300">Drop agent package here</p>
              <p className="text-xs text-gray-500">or click to browse</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// Unpacking animation - items flying out of box
function UnpackingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full h-full flex items-center justify-center"
    >
      {/* Box opening */}
      <motion.div
        animate={{
          rotateX: [0, -15, 0],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
        }}
      >
        <Package className="w-20 h-20 text-purple-400" strokeWidth={1.5} />
      </motion.div>

      {/* Items flying out */}
      {ITEMS_UNPACKING.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
          animate={{
            x: 80 * Math.cos((index * Math.PI * 2) / ITEMS_UNPACKING.length + Math.PI / 4),
            y: 80 * Math.sin((index * Math.PI * 2) / ITEMS_UNPACKING.length + Math.PI / 4),
            opacity: [0, 1, 1, 1],
            scale: [0.3, 1, 1, 1],
          }}
          transition={{
            duration: 1.5,
            delay: index * 0.2,
            repeat: Infinity,
            repeatDelay: 0.3,
          }}
          className="absolute"
        >
          <item.icon className={`w-6 h-6 ${item.color}`} />
        </motion.div>
      ))}
    </motion.div>
  )
}

// Setup animation - agent exploring new home
function SetupAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex items-center justify-center"
    >
      {/* Home */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10 }}
      >
        <Home className="w-24 h-24 text-green-400/30" strokeWidth={1} />
      </motion.div>

      {/* Agent moving around */}
      <motion.div
        animate={{
          x: [-20, 20, -20],
          y: [-10, 10, -10],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute text-4xl"
      >
        🤖
      </motion.div>

      {/* Sparkles */}
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.2,
            delay: i * 0.3,
            repeat: Infinity,
          }}
          className="absolute text-yellow-400"
          style={{
            left: `${30 + i * 15}%`,
            top: `${20 + (i % 2) * 40}%`,
          }}
        >
          <Sparkles className="w-4 h-4" />
        </motion.div>
      ))}
    </motion.div>
  )
}

// Ready animation - agent settled in
function ReadyAnimation({ agentName }: { agentName?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center gap-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 8 }}
        className="text-6xl"
      >
        🤖
      </motion.div>

      <motion.div
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', damping: 10 }}
        className="text-4xl"
      >
        👋
      </motion.div>

      {agentName && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-gray-400"
        >
          Say hello to <span className="text-white font-medium">{agentName}</span>!
        </motion.p>
      )}

      {/* Confetti */}
      {[...Array(10)].map((_, i) => (
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
            delay: Math.random() * 0.3,
          }}
          className="absolute text-xl"
        >
          {['🎉', '✨', '🎊', '⭐', '🌟'][Math.floor(Math.random() * 5)]}
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
