'use client'

import { useState } from 'react'
import { Plus, Pin, Trash2, FileText, Clock } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import DocumentEditor from './DocumentEditor'
import type { TeamDocument } from '@/types/document'

interface TeamDocumentsSectionProps {
  teamId: string
}

export default function TeamDocumentsSection({ teamId }: TeamDocumentsSectionProps) {
  const { documents, createDocument, updateDocument, deleteDocument } = useDocuments(teamId)
  const [editingDoc, setEditingDoc] = useState<TeamDocument | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Sort: pinned first, then by updatedAt descending
  const sortedDocs = [...documents].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  // If editing or creating, show the editor
  if (creating) {
    return (
      <DocumentEditor
        onSave={async (data) => {
          await createDocument(data)
          setCreating(false)
        }}
        onCancel={() => setCreating(false)}
      />
    )
  }

  if (editingDoc) {
    return (
      <DocumentEditor
        initialTitle={editingDoc.title}
        initialContent={editingDoc.content}
        initialPinned={editingDoc.pinned}
        onSave={async (data) => {
          await updateDocument(editingDoc.id, data)
          setEditingDoc(null)
        }}
        onCancel={() => setEditingDoc(null)}
      />
    )
  }

  const handleDelete = async (docId: string) => {
    await deleteDocument(docId)
    setDeleteConfirm(null)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Documents</h2>
          <p className="text-xs text-gray-500">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Document
        </button>
      </div>

      {/* Document Grid */}
      {sortedDocs.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No documents yet</p>
          <p className="text-xs text-gray-600 mt-1">Create a document to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedDocs.map(doc => (
            <div
              key={doc.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:border-gray-600 transition-colors cursor-pointer group"
              onClick={() => setEditingDoc(doc)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-white truncate flex-1 mr-2">
                  {doc.title}
                </h3>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.pinned && (
                    <Pin className="w-3 h-3 text-amber-400" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(doc.id) }}
                    className="p-1 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                {doc.content ? doc.content.slice(0, 120) + (doc.content.length > 120 ? '...' : '') : 'Empty document'}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                <Clock className="w-3 h-3" />
                {new Date(doc.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h4 className="text-sm font-medium text-white mb-2">Delete Document</h4>
            <p className="text-xs text-gray-400 mb-4">Are you sure you want to delete this document? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
