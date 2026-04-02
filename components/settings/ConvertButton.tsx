/**
 * ConvertButton — mini-button with target client dropdown.
 * Full flow: dry-run → confirmation → convert → success/error dialogs.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
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
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const providers = getAllProviders().filter(p => p.id !== sourceClient)

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
        onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen) }}
        disabled={loading}
        title="Convert to another client"
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors disabled:opacity-50"
      >
        <Repeat className="w-3 h-3" />
        {loading ? 'Converting...' : 'Convert'}
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Target client dropdown */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1">
          <div className="px-3 py-1.5 text-xs text-gray-500 font-semibold">Convert to:</div>
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => handleTargetClick(p.id)}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {dialog === 'confirm' && selectedTarget && dryRunResult && (
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
        />
      )}
      {dialog === 'conflict' && (
        <ConflictErrorDialog
          name={elementName}
          existingPath={conflictPath}
          sourcePath={sourcePath}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'error' && (
        <ConversionErrorDialog
          name={elementName}
          error={errorMsg}
          sourcePath={sourcePath}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
