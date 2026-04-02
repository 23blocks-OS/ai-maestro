/**
 * ConvertButton — mini-button with target client dropdown.
 * Full flow: dry-run → confirmation → convert → success/error dialogs.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Repeat, ChevronDown } from 'lucide-react'
import { getAllProviders } from '@/lib/converter/registry'
import type { ProviderId, ElementType } from '@/lib/converter/types'
import { ConvertConfirmDialog, ConflictErrorDialog, ConversionErrorDialog } from './ConversionDialogs'

interface ConvertButtonProps {
  elementName: string
  elementType: ElementType
  sourceClient: ProviderId
  sourcePath: string
  onConverted?: (targetClient: ProviderId, elementName: string) => void
}

export default function ConvertButton({
  elementName, elementType, sourceClient, sourcePath, onConverted
}: ConvertButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<'confirm' | 'conflict' | 'error' | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<ProviderId | null>(null)
  const [dryRunResult, setDryRunResult] = useState<{ files: number; warnings: string[]; destPath: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [conflictPath, setConflictPath] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [flipLeft, setFlipLeft] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Viewport overflow detection: flip dropdown to left-0 if near right edge
  useEffect(() => {
    if (!dropdownOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // 192px = w-48 dropdown width
    const wouldOverflow = rect.right + 192 > window.innerWidth
    setFlipLeft(wouldOverflow || rect.left < 192)
  }, [dropdownOpen])

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      setFocusedIndex(0)
      // Small delay to let the dropdown render
      requestAnimationFrame(() => menuItemsRef.current[0]?.focus())
    } else {
      setFocusedIndex(-1)
    }
  }, [dropdownOpen])

  const providers = getAllProviders().filter(p => p.id !== sourceClient)

  // Keyboard navigation for the dropdown menu
  const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setDropdownOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (focusedIndex + 1) % providers.length
      setFocusedIndex(next)
      menuItemsRef.current[next]?.focus()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (focusedIndex - 1 + providers.length) % providers.length
      setFocusedIndex(prev)
      menuItemsRef.current[prev]?.focus()
      return
    }
  }, [focusedIndex, providers.length])

  // Keyboard handler for the trigger button
  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !dropdownOpen) {
      e.preventDefault()
      setDropdownOpen(true)
    }
  }, [dropdownOpen])

  const handleTargetClick = async (target: ProviderId) => {
    setDropdownOpen(false)
    setSelectedTarget(target)
    setLoading(true)

    try {
      // Dry-run first
      const res = await fetch('/api/settings/global-elements/convert-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourcePath, targetClient: target, elements: [elementType], dryRun: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('conflict')) {
          setConflictPath(data.error.match(/exists at: (.+)/)?.[1] || 'unknown')
          setDialog('conflict')
        } else {
          setErrorMsg(data.error || 'Unknown error')
          setDialog('error')
        }
        return
      }

      // Show confirmation with dry-run results
      const destPath = data.files?.[0]?.path
        ? `~/${data.files[0].path}`
        : `~/.${target}/skills/${elementName}/`
      setDryRunResult({
        files: data.files?.length || 0,
        warnings: data.warnings || [],
        destPath,
      })
      setDialog('confirm')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
      setDialog('error')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedTarget) return
    setDialog(null)
    setLoading(true)

    try {
      const res = await fetch('/api/settings/global-elements/convert-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourcePath, targetClient: selectedTarget, elements: [elementType], dryRun: false }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('conflict')) {
          setConflictPath(data.error.match(/exists at: (.+)/)?.[1] || 'unknown')
          setDialog('conflict')
        } else {
          setErrorMsg(data.error || 'Conversion failed')
          setDialog('error')
        }
        return
      }

      // Success — notify parent to switch tab + highlight
      onConverted?.(selectedTarget, elementName)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error')
      setDialog('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen) }}
        onKeyDown={handleTriggerKeyDown}
        disabled={loading}
        aria-label="Convert to another client"
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors disabled:opacity-50"
      >
        <Repeat className="w-3 h-3" />
        <span aria-live="polite">{loading ? 'Converting...' : 'Convert'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Target client dropdown */}
      {dropdownOpen && (
        <div
          role="menu"
          onKeyDown={handleDropdownKeyDown}
          className={`absolute ${flipLeft ? 'left-0' : 'right-0'} mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1`}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 font-semibold">Convert to:</div>
          {providers.map((p, i) => (
            <button
              key={p.id}
              ref={el => { menuItemsRef.current[i] = el }}
              role="menuitem"
              tabIndex={focusedIndex === i ? 0 : -1}
              onClick={() => handleTargetClick(p.id)}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white focus:bg-gray-700 focus:text-white focus:outline-none transition-colors"
            >
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Dialogs — portaled to body to avoid containing-block issues from relative parent */}
      {dialog === 'confirm' && selectedTarget && dryRunResult && createPortal(
        <ConvertConfirmDialog
          name={elementName}
          sourceClient={sourceClient}
          targetClient={selectedTarget}
          sourcePath={sourcePath}
          destPath={dryRunResult.destPath}
          fileCount={dryRunResult.files}
          warnings={dryRunResult.warnings}
          onConfirm={handleConfirm}
          onCancel={() => setDialog(null)}
        />,
        document.body
      )}
      {dialog === 'conflict' && createPortal(
        <ConflictErrorDialog
          name={elementName}
          existingPath={conflictPath}
          sourcePath={sourcePath}
          onClose={() => setDialog(null)}
        />,
        document.body
      )}
      {dialog === 'error' && createPortal(
        <ConversionErrorDialog
          name={elementName}
          error={errorMsg}
          sourcePath={sourcePath}
          onClose={() => setDialog(null)}
        />,
        document.body
      )}
    </div>
  )
}
