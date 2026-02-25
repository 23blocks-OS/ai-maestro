'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye, EyeOff, Copy, Check, AlertTriangle } from 'lucide-react'

interface SecretRevealDialogProps {
  isOpen: boolean
  secret: string
  onClose: () => void
}

export default function SecretRevealDialog({ isOpen, secret, onClose }: SecretRevealDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setShowSecret(false)
      setCopied(false)
    }
  }, [isOpen])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the text
      const el = document.querySelector('[data-secret-text]') as HTMLElement
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="text-lg font-semibold text-gray-100">Webhook Created</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-300">
                  Copy your secret now. It won&apos;t be shown again.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Secret</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <code
                      data-secret-text
                      className="block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono text-gray-200 select-all overflow-x-auto"
                    >
                      {showSecret ? secret : '\u2022'.repeat(Math.min(secret.length, 40))}
                    </code>
                  </div>
                  <button
                    onClick={() => setShowSecret(prev => !prev)}
                    className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end p-4 border-t border-zinc-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-zinc-700 text-gray-200 rounded-md hover:bg-zinc-600 transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
