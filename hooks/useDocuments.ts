'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { TeamDocument } from '@/types/document'

interface UseDocumentsResult {
  documents: TeamDocument[]
  loading: boolean
  error: string | null
  createDocument: (data: { title: string; content: string; pinned?: boolean; tags?: string[] }) => Promise<void>
  updateDocument: (docId: string, updates: { title?: string; content?: string; pinned?: boolean; tags?: string[] }) => Promise<void>
  deleteDocument: (docId: string) => Promise<void>
  refreshDocuments: () => Promise<void>
}

export function useDocuments(teamId: string | null): UseDocumentsResult {
  const [documents, setDocuments] = useState<TeamDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchDocuments = useCallback(async () => {
    if (!teamId) return
    try {
      const res = await fetch(`/api/teams/${teamId}/documents`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data = await res.json()
      setDocuments(data.documents || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    }
  }, [teamId])

  // Initial fetch
  useEffect(() => {
    if (!teamId) {
      setDocuments([])
      return
    }
    setLoading(true)
    fetchDocuments().finally(() => setLoading(false))
  }, [teamId, fetchDocuments])

  // Poll every 5s for multi-tab sync
  useEffect(() => {
    if (!teamId) return
    intervalRef.current = setInterval(fetchDocuments, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [teamId, fetchDocuments])

  const createDocument = useCallback(async (data: { title: string; content: string; pinned?: boolean; tags?: string[] }) => {
    if (!teamId) return
    const res = await fetch(`/api/teams/${teamId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create document')
    await fetchDocuments()
  }, [teamId, fetchDocuments])

  const updateDocument = useCallback(async (docId: string, updates: { title?: string; content?: string; pinned?: boolean; tags?: string[] }) => {
    if (!teamId) return
    // Optimistic update
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d))
    const res = await fetch(`/api/teams/${teamId}/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      await fetchDocuments() // Revert optimistic update
      throw new Error('Failed to update document')
    }
    await fetchDocuments()
  }, [teamId, fetchDocuments])

  const deleteDocument = useCallback(async (docId: string) => {
    if (!teamId) return
    // Optimistic update
    setDocuments(prev => prev.filter(d => d.id !== docId))
    const res = await fetch(`/api/teams/${teamId}/documents/${docId}`, { method: 'DELETE' })
    if (!res.ok) {
      await fetchDocuments() // Revert
      throw new Error('Failed to delete document')
    }
  }, [teamId, fetchDocuments])

  return {
    documents,
    loading,
    error,
    createDocument,
    updateDocument,
    deleteDocument,
    refreshDocuments: fetchDocuments,
  }
}
