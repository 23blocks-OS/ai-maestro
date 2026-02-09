/**
 * Document types for Team Documents feature
 *
 * TeamDocuments are markdown documents attached to a team,
 * supporting pinning, tagging, and standard CRUD operations.
 */

export interface TeamDocument {
  id: string              // UUID
  teamId: string          // Team this document belongs to
  title: string           // "API Design Guide"
  content: string         // Markdown content
  pinned?: boolean        // Pinned documents appear first
  tags?: string[]         // Optional tags for organization
  createdAt: string       // ISO
  updatedAt: string       // ISO
}

export interface TeamDocumentsFile {
  version: 1
  documents: TeamDocument[]
}
