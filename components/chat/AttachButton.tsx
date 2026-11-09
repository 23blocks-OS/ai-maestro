'use client'

import { useRef } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'

/** The chat's paperclip: pick images or documents and hand them to the agent (same as the phone app). */
export default function AttachButton({ onFiles, busy, disabled, className = '' }: {
  onFiles: (files: File[]) => void
  busy: boolean
  disabled?: boolean
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = '' // the same file can be picked again
          if (files.length) onFiles(files)
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || busy}
        title="Attach images or documents"
        aria-label="Attach images or documents"
        className={`flex-shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
      </button>
    </>
  )
}
