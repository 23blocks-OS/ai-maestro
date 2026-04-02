/**
 * Shared dialog components for install, convert, conflict, and error flows.
 * All show full source + destination paths.
 */

'use client'

import { useEffect, useRef } from 'react'
import { X, AlertTriangle, XCircle, CheckCircle, ArrowRight } from 'lucide-react'
import type { ProviderId } from '@/lib/converter/types'
import { getProvider } from '@/lib/converter/registry'

/**
 * Overlay backdrop + centered card with Escape key, focus trap, scroll lock,
 * and proper ARIA dialog semantics.
 */
function DialogOverlay({ children, onClose, titleId }: { children: React.ReactNode; onClose: () => void; titleId?: string }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousOverflow = useRef<string>('')

  // Escape key handler + scroll lock
  useEffect(() => {
    previousOverflow.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow.current
    }
  }, [onClose])

  // Focus trap: auto-focus dialog on mount, cycle Tab within dialog
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusables = dialog.querySelectorAll<HTMLElement>(focusableSelector)
    if (focusables.length > 0) focusables[0].focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const currentFocusables = dialog.querySelectorAll<HTMLElement>(focusableSelector)
      if (currentFocusables.length === 0) return

      const first = currentFocusables[0]
      const last = currentFocusables[currentFocusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** Path display with monospace styling */
function PathDisplay({ label, path }: { label: string; path: string }) {
  return (
    <div className="mb-2">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <div className="mt-0.5 px-3 py-1.5 bg-gray-800/80 rounded text-xs text-gray-300 font-mono break-all border border-gray-700/50">
        {path}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// A. Install Confirmation Dialog
// ═══════════════════════════════════════════════════

interface InstallConfirmProps {
  name: string
  sourcePath: string
  destPath: string
  client: string
  scope: 'user' | 'project'
  onConfirm: () => void
  onCancel: () => void
}

export function InstallConfirmDialog({ name, sourcePath, destPath, client, scope, onConfirm, onCancel }: InstallConfirmProps) {
  return (
    <DialogOverlay onClose={onCancel} titleId="install-dialog-title">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle className="w-6 h-6 text-blue-400" />
        <h3 id="install-dialog-title" className="text-lg font-semibold text-white">Install Skill</h3>
      </div>
      <div className="space-y-3 mb-5">
        <div className="text-sm text-gray-300">
          <strong className="text-white">{name}</strong>
        </div>
        <PathDisplay label="Source" path={sourcePath} />
        <PathDisplay label="Destination" path={destPath} />
        <div className="flex gap-4 text-sm text-gray-400">
          <span>Client: <strong className="text-gray-200">{client}</strong></span>
          <span>Scope: <strong className="text-gray-200">{scope === 'user' ? 'User (global)' : 'Project (local)'}</strong></span>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="min-h-[44px] px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
        <button onClick={onConfirm} className="min-h-[44px] px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">Install</button>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════
// B. Convert Confirmation Dialog
// ═══════════════════════════════════════════════════

interface ConvertConfirmProps {
  name: string
  sourceClient: ProviderId
  targetClient: ProviderId
  sourcePath: string
  destPath: string
  fileCount: number
  warnings: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function ConvertConfirmDialog({ name, sourceClient, targetClient, sourcePath, destPath, fileCount, warnings, onConfirm, onCancel }: ConvertConfirmProps) {
  const srcProvider = getProvider(sourceClient)
  const tgtProvider = getProvider(targetClient)

  return (
    <DialogOverlay onClose={onCancel} titleId="convert-dialog-title">
      <div className="flex items-center gap-3 mb-4">
        <ArrowRight className="w-6 h-6 text-blue-400" />
        <h3 id="convert-dialog-title" className="text-lg font-semibold text-white">Convert: {name}</h3>
      </div>
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="text-gray-500">From:</span>
          <strong className="text-white">{srcProvider?.displayName}</strong>
          <ArrowRight className="w-4 h-4 text-gray-600" />
          <span className="text-gray-500">To:</span>
          <strong className="text-white">{tgtProvider?.displayName}</strong>
        </div>
        <PathDisplay label="Source" path={sourcePath} />
        <PathDisplay label="Destination" path={destPath} />
        <div className="text-sm text-gray-400">
          Files to create: <strong className="text-gray-200">{fileCount}</strong>
        </div>
        {warnings.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="text-xs text-amber-400 font-semibold mb-1">Conversion Notes:</div>
            <ul className="text-xs text-amber-300/80 space-y-0.5">
              {warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
              {warnings.length > 5 && <li>...and {warnings.length - 5} more</li>}
            </ul>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="min-h-[44px] px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
        <button onClick={onConfirm} className="min-h-[44px] px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">Convert</button>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════
// C. Name Conflict Error Dialog
// ═══════════════════════════════════════════════════

interface ConflictErrorProps {
  name: string
  existingPath: string
  sourcePath: string
  onClose: () => void
}

export function ConflictErrorDialog({ name, existingPath, sourcePath, onClose }: ConflictErrorProps) {
  return (
    <DialogOverlay onClose={onClose} titleId="conflict-dialog-title">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <h3 id="conflict-dialog-title" className="text-lg font-semibold text-white">Name Conflict</h3>
      </div>
      <div className="space-y-3 mb-5">
        <p className="text-sm text-gray-300">
          Cannot install &mdash; an element named <strong className="text-white">&ldquo;{name}&rdquo;</strong> already exists for this client.
        </p>
        <PathDisplay label="Existing" path={existingPath} />
        <PathDisplay label="Source" path={sourcePath} />
        <div className="p-3 bg-gray-800/80 border border-gray-700/50 rounded-lg text-sm text-gray-400">
          <p className="font-medium text-gray-300 mb-1">To resolve this conflict:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Rename or remove the existing element first</li>
            <li>Then try the conversion again</li>
          </ol>
          <p className="mt-2 text-xs text-gray-500">Existing standalone elements are never overwritten.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="min-h-[44px] px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors">Close</button>
      </div>
    </DialogOverlay>
  )
}

// ═══════════════════════════════════════════════════
// D. Conversion Error Dialog
// ═══════════════════════════════════════════════════

interface ConversionErrorProps {
  name: string
  error: string
  sourcePath: string
  onClose: () => void
}

export function ConversionErrorDialog({ name, error, sourcePath, onClose }: ConversionErrorProps) {
  return (
    <DialogOverlay onClose={onClose} titleId="error-dialog-title">
      <div className="flex items-center gap-3 mb-4">
        <XCircle className="w-6 h-6 text-red-400" />
        <h3 id="error-dialog-title" className="text-lg font-semibold text-white">Conversion Failed</h3>
      </div>
      <div className="space-y-3 mb-5">
        <p className="text-sm text-gray-300">
          Could not convert <strong className="text-white">&ldquo;{name}&rdquo;</strong>.
        </p>
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="text-xs text-red-400 font-semibold mb-1">Error:</div>
          <p className="text-sm text-red-300/90 font-mono break-all">{error}</p>
        </div>
        <PathDisplay label="Source" path={sourcePath} />
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="min-h-[44px] px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors">Close</button>
      </div>
    </DialogOverlay>
  )
}
