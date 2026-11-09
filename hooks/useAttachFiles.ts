'use client'

import { useCallback, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'

/** Hand files to an agent from any view: terminal drop or paste, the chat's paperclip (#270). */
/** `baseUrl`: the agent's host ('' for this one), as getAgentBaseUrl gives it. */
export function useAttachFiles(agentId: string | undefined, baseUrl: string = '') {
  const { addToast } = useToast()
  const [isUploading, setIsUploading] = useState(false)

  /**
   * Hand files to the agent (#270).
   *
   * The bytes go to the server, which writes them to disk on the agent's own
   * host and tells the agent the path — agent CLIs read files from disk, and
   * pushing a megabyte of base64 through a TUI keystroke-batch would be both
   * enormous and mangled.
   */
  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    if (!agentId) {
      addToast({ type: 'error', title: 'Cannot attach files', message: 'This session has no registered agent.' })
      return
    }

    setIsUploading(true)
    try {
      const form = new FormData()
      // A pasted screenshot has no name. The server generates one from the MIME
      // type rather than inventing a uuid, because the agent quotes the path
      // back to a human.
      for (const f of files) form.append('files', f, f.name || '')

      const res = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}/files`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Could not attach the file',
          message: data?.message || `Upload failed (${res.status})`,
        })
        return
      }

      // Saved and announced are separate outcomes: the file can land safely
      // while the agent cannot be told (no session, or a program that never
      // started). Reporting that as plain success would be a claim we have not
      // earned.
      if (data?.announced === false) {
        addToast({
          type: 'warning',
          title: 'File saved, but the agent was not told',
          message: `${data.announceError || 'The agent could not be reached.'} The file is at ${data.files?.[0]?.path ?? 'the upload directory'}.`,
          duration: 15000,
        })
        return
      }

      const n = data?.files?.length ?? files.length
      addToast({
        type: 'success',
        title: n === 1 ? 'File sent to the agent' : `${n} files sent to the agent`,
        message: data?.files?.[0]?.path || '',
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Could not attach the file',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsUploading(false)
    }
  }, [agentId, baseUrl, addToast])

  /** Images pasted into a text box go to the agent; text pastes are left alone */
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    void uploadFiles(files)
  }, [uploadFiles])

  return { uploadFiles, isUploading, onPaste }
}
