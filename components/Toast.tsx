'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react'
import type { Toast, ToastType } from '@/contexts/ToastContext'

const STYLE: Record<ToastType, { border: string; icon: string; bar: string }> = {
  error:   { border: 'border-red-500/30',     icon: 'text-red-400',     bar: 'bg-red-500' },
  success: { border: 'border-emerald-500/30', icon: 'text-emerald-400', bar: 'bg-emerald-500' },
  warning: { border: 'border-amber-500/30',   icon: 'text-amber-400',   bar: 'bg-amber-500' },
  info:    { border: 'border-blue-500/30',     icon: 'text-blue-400',    bar: 'bg-blue-500' },
}

const ICONS: Record<ToastType, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
}

interface ToastItemProps {
  toast: Toast
  onRemove: (id: string) => void
}

export default function ToastItem({ toast, onRemove }: ToastItemProps) {
  const style = STYLE[toast.type]
  const Icon = ICONS[toast.type]
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const duration = toast.duration
    const frame = () => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining > 0) requestAnimationFrame(frame)
    }
    const raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [toast.duration])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`pointer-events-auto relative overflow-hidden rounded-lg border ${style.border} bg-zinc-900/95 backdrop-blur-sm shadow-lg shadow-black/20`}
    >
      <div className="flex items-start gap-3 p-4 pr-10">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.icon}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-100">{toast.title}</p>
          {toast.message && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{toast.message}</p>
          )}
        </div>
      </div>

      <button
        onClick={() => onRemove(toast.id)}
        className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-zinc-800">
        <div
          className={`h-full ${style.bar} transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  )
}
