/**
 * Documentation Indexer
 *
 * Indexes markdown and text files for semantic search.
 * Extracts sections, chunks, and generates embeddings.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { glob } from 'glob'
import { AgentDatabase } from '../cozo-db'
import { embedTexts, vectorToBuffer } from './embeddings'
import { extractTerms } from './keywords'

// Document patterns to index
const DOC_PATTERNS = [
  '**/*.md',
  '**/*.mdx',
  '**/*.txt',
  '**/docs/**',
  '**/documentation/**',
]

// Patterns to exclude
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/*.min.*',
]

// Document type detection patterns
const DOC_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /adr[-_]?\d+|decision[-_]?\d+|ADR/i, type: 'adr' },
  { pattern: /readme/i, type: 'readme' },
  { pattern: /changelog/i, type: 'changelog' },
  { pattern: /contributing/i, type: 'contributing' },
  { pattern: /design|architecture/i, type: 'design' },
  { pattern: /api[-_]?doc|openapi|swagger/i, type: 'api' },
  { pattern: /setup|install|getting[-_]?started/i, type: 'setup' },
  { pattern: /roadmap|plan/i, type: 'roadmap' },
  { pattern: /spec|specification/i, type: 'spec' },
  { pattern: /guide|tutorial|howto/i, type: 'guide' },
]

interface DocumentSection {
  id: string
  heading: string
  level: number
  content: string
  charStart: number
  charEnd: number
  parentId?: string
}

interface DocumentChunk {
  id: string
  content: string
  heading?: string
  charStart: number
  charEnd: number
}

interface IndexedDocument {
  docId: string
  filePath: string
  title: string
  docType: string
  checksum: string
  sections: DocumentSection[]
  chunks: DocumentChunk[]
}

interface IndexStats {
  documents: number
  sections: number
  chunks: number
  embeddings: number
}

/**
 * Detect document type from file path and content
 */
function detectDocType(filePath: string, content: string): string {
  const fileName = path.basename(filePath)
  const dirName = path.dirname(filePath)

  for (const { pattern, type } of DOC_TYPE_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(dirName)) {
      return type
    }
  }

  // Check content for type hints
  const firstLines = content.slice(0, 500).toLowerCase()
  if (firstLines.includes('architecture decision record') || firstLines.includes('# adr')) {
    return 'adr'
  }
  if (firstLines.includes('design document') || firstLines.includes('technical design')) {
    return 'design'
  }

  return 'doc'
}

/**
 * Extract title from document content
 */
function extractTitle(content: string, filePath: string): string {
  // Try to find H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }

  // Try first line if it's short
  const firstLine = content.split('\n')[0]?.trim()
  if (firstLine && firstLine.length < 100 && !firstLine.startsWith('#')) {
    return firstLine
  }

  // Fall back to filename
  return path.basename(filePath, path.extname(filePath))
}

/**
 * Parse markdown content into hierarchical sections
 */
function parseSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const stack: DocumentSection[] = []

  let lastIndex = 0
  let match: RegExpExecArray | null
  let sectionIndex = 0

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const heading = match[2].trim()
    const charStart = match.index

    // Close previous section
    if (sections.length > 0) {
      const lastSection = sections[sections.length - 1]
      lastSection.charEnd = charStart
      lastSection.content = content.slice(lastSection.charStart, lastSection.charEnd).trim()
    }

    // Find parent section (closest section with lower level)
    let parentId: string | undefined
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].level < level) {
        parentId = stack[i].id
        break
      }
    }

    // Update stack - remove sections at same or higher level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }

    const section: DocumentSection = {
      id: `sec-${sectionIndex++}`,
      heading,
      level,
      content: '',
      charStart,
      charEnd: content.length,
      parentId,
    }

    sections.push(section)
    stack.push(section)
    lastIndex = charStart
  }

  // Close the last section
  if (sections.length > 0) {
    const lastSection = sections[sections.length - 1]
    lastSection.charEnd = content.length
    lastSection.content = content.slice(lastSection.charStart, lastSection.charEnd).trim()
  }

  // If no sections found, create one for the whole document
  if (sections.length === 0) {
    sections.push({
      id: 'sec-0',
      heading: 'Document',
      level: 1,
      content: content.trim(),
      charStart: 0,
      charEnd: content.length,
    })
  }

  return sections
}

/**
 * Split document into chunks for semantic search
 * Chunks are roughly paragraph-sized, respecting section boundaries
 */
function createChunks(content: string, sections: DocumentSection[], maxChunkSize = 1500): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  let chunkIndex = 0

  for (const section of sections) {
    const sectionContent = section.content

    // Skip empty sections
    if (!sectionContent.trim()) continue

    // If section is small enough, use it as a single chunk
    if (sectionContent.length <= maxChunkSize) {
      chunks.push({
        id: `chunk-${chunkIndex++}`,
        content: sectionContent,
        heading: section.heading,
        charStart: section.charStart,
        charEnd: section.charEnd,
      })
      continue
    }

    // Split large sections by paragraphs
    const paragraphs = sectionContent.split(/\n\n+/)
    let currentChunk = ''
    let currentStart = section.charStart

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          content: currentChunk.trim(),
          heading: section.heading,
          charStart: currentStart,
          charEnd: currentStart + currentChunk.length,
        })
        currentChunk = para
        currentStart = currentStart + currentChunk.length
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk-${chunkIndex++}`,
        content: currentChunk.trim(),
        heading: section.heading,
        charStart: currentStart,
        charEnd: section.charEnd,
      })
    }
  }

  return chunks
}

/**
 * Compute checksum for content
 */
function computeChecksum(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * Generate a document ID from file path
 */
function generateDocId(filePath: string, projectPath: string): string {
  const relativePath = path.relative(projectPath, filePath)
  return crypto.createHash('md5').update(relativePath).digest('hex').slice(0, 16)
}

/**
 * Parse a single document file
 */
async function parseDocument(filePath: string, projectPath: string): Promise<IndexedDocument | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')

    // Skip empty files
    if (!content.trim()) return null

    // Skip very large files (> 100KB)
    if (content.length > 100000) {
      console.log(`[Doc Indexer] Skipping large file: ${filePath}`)
      return null
    }

    const docId = generateDocId(filePath, projectPath)
    const title = extractTitle(content, filePath)
    const docType = detectDocType(filePath, content)
    const checksum = computeChecksum(content)
    const sections = parseSections(content)
    const chunks = createChunks(content, sections)

    return {
      docId,
      filePath,
      title,
      docType,
      checksum,
      sections,
      chunks,
    }
  } catch (error) {
    console.error(`[Doc Indexer] Error parsing ${filePath}:`, error)
    return null
  }
}

/**
 * CozoDB string escaping helper
 */
function escapeForCozo(s: string): string {
  return "'" + s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    + "'"
}

/**
 * Clear documentation graph for a project
 */
export async function clearDocGraph(agentDb: AgentDatabase, projectPath?: string): Promise<void> {
  console.log(`[Doc Indexer] Clearing documentation graph${projectPath ? ` for ${projectPath}` : ''}...`)

  try {
    if (projectPath) {
      // Get doc IDs for this project
      const docsResult = await agentDb.run(`
        ?[doc_id] := *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}
      `)

      const docIds = docsResult.rows.map((r: any[]) => r[0])

      if (docIds.length > 0) {
        const idList = docIds.map((id: string) => escapeForCozo(id)).join(', ')

        // Delete in order: embeddings -> terms -> chunks -> sections -> tags -> documents
        await agentDb.run(`?[chunk_id, vec] := *doc_chunk_vec{chunk_id, vec}, *doc_chunks{chunk_id, doc_id}, is_in(doc_id, [${idList}]) :rm doc_chunk_vec`)
        await agentDb.run(`?[chunk_id, term] := *doc_terms{chunk_id, term}, *doc_chunks{chunk_id, doc_id}, is_in(doc_id, [${idList}]) :rm doc_terms`)
        await agentDb.run(`?[chunk_id, doc_id, chunk_index, heading, content, char_start, char_end] := *doc_chunks{chunk_id, doc_id, chunk_index, heading, content, char_start, char_end}, is_in(doc_id, [${idList}]) :rm doc_chunks`)
        await agentDb.run(`?[section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end] := *doc_sections{section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end}, is_in(doc_id, [${idList}]) :rm doc_sections`)
        await agentDb.run(`?[doc_id, tag] := *doc_tags{doc_id, tag}, is_in(doc_id, [${idList}]) :rm doc_tags`)
        await agentDb.run(`?[doc_id, file_path, title, doc_type, project_path, checksum, created_at, updated_at] := *documents{doc_id, file_path, title, doc_type, project_path, checksum, created_at, updated_at}, is_in(doc_id, [${idList}]) :rm documents`)
      }
    } else {
      // Clear all
      await agentDb.run(`?[chunk_id, vec] := *doc_chunk_vec{chunk_id, vec} :rm doc_chunk_vec`)
      await agentDb.run(`?[chunk_id, term] := *doc_terms{chunk_id, term} :rm doc_terms`)
      await agentDb.run(`?[chunk_id, doc_id, chunk_index, heading, content, char_start, char_end] := *doc_chunks{chunk_id, doc_id, chunk_index, heading, content, char_start, char_end} :rm doc_chunks`)
      await agentDb.run(`?[section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end] := *doc_sections{section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end} :rm doc_sections`)
      await agentDb.run(`?[doc_id, tag] := *doc_tags{doc_id, tag} :rm doc_tags`)
      await agentDb.run(`?[doc_id, file_path, title, doc_type, project_path, checksum, created_at, updated_at] := *documents{doc_id, file_path, title, doc_type, project_path, checksum, created_at, updated_at} :rm documents`)
    }

    console.log(`[Doc Indexer] Documentation graph cleared`)
  } catch (error: any) {
    // Tables might not exist yet
    if (!error.message?.includes('not found')) {
      console.error('[Doc Indexer] Error clearing graph:', error)
    }
  }
}

/**
 * Index documentation for a project
 */
export async function indexDocumentation(
  agentDb: AgentDatabase,
  projectPath: string,
  options: {
    clear?: boolean
    includePatterns?: string[]
    excludePatterns?: string[]
    generateEmbeddings?: boolean
    onProgress?: (status: string) => void
  } = {}
): Promise<IndexStats> {
  const {
    clear = true,
    includePatterns = DOC_PATTERNS,
    excludePatterns = EXCLUDE_PATTERNS,
    generateEmbeddings = true,
    onProgress,
  } = options

  const stats: IndexStats = {
    documents: 0,
    sections: 0,
    chunks: 0,
    embeddings: 0,
  }

  const log = (msg: string) => {
    console.log(`[Doc Indexer] ${msg}`)
    onProgress?.(msg)
  }

  log(`Indexing documentation in ${projectPath}`)

  // Clear existing data if requested
  if (clear) {
    await clearDocGraph(agentDb, projectPath)
  }

  // Find all documentation files
  const allFiles: string[] = []
  for (const pattern of includePatterns) {
    const files = await glob(pattern, {
      cwd: projectPath,
      absolute: true,
      ignore: excludePatterns,
      nodir: true,
    })
    allFiles.push(...files)
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)]
  log(`Found ${uniqueFiles.length} documentation files`)

  const now = Date.now()
  const allChunks: { chunkId: string; content: string }[] = []

  // Process each file
  for (const filePath of uniqueFiles) {
    const doc = await parseDocument(filePath, projectPath)
    if (!doc) continue

    try {
      // Insert document
      await agentDb.run(`
        ?[doc_id, file_path, title, doc_type, project_path, checksum, created_at, updated_at] <- [[
          ${escapeForCozo(doc.docId)},
          ${escapeForCozo(doc.filePath)},
          ${escapeForCozo(doc.title)},
          ${escapeForCozo(doc.docType)},
          ${escapeForCozo(projectPath)},
          ${escapeForCozo(doc.checksum)},
          ${now},
          ${now}
        ]]
        :put documents
      `)
      stats.documents++

      // Insert sections
      for (const section of doc.sections) {
        const sectionId = `${doc.docId}-${section.id}`
        const parentSectionId = section.parentId ? `${doc.docId}-${section.parentId}` : null

        await agentDb.run(`
          ?[section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end] <- [[
            ${escapeForCozo(sectionId)},
            ${escapeForCozo(doc.docId)},
            ${escapeForCozo(section.heading)},
            ${section.level},
            ${parentSectionId ? escapeForCozo(parentSectionId) : 'null'},
            ${escapeForCozo(section.content.slice(0, 10000))},
            ${section.charStart},
            ${section.charEnd}
          ]]
          :put doc_sections
        `)
        stats.sections++
      }

      // Insert chunks
      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i]
        const chunkId = `${doc.docId}-${chunk.id}`

        await agentDb.run(`
          ?[chunk_id, doc_id, chunk_index, heading, content, char_start, char_end] <- [[
            ${escapeForCozo(chunkId)},
            ${escapeForCozo(doc.docId)},
            ${i},
            ${chunk.heading ? escapeForCozo(chunk.heading) : 'null'},
            ${escapeForCozo(chunk.content)},
            ${chunk.charStart},
            ${chunk.charEnd}
          ]]
          :put doc_chunks
        `)
        stats.chunks++

        // Extract and store terms
        const terms = extractTerms(chunk.content)
        if (terms.length > 0) {
          const termRows = terms.map(term =>
            `[${escapeForCozo(chunkId)}, ${escapeForCozo(term)}]`
          ).join(', ')
          await agentDb.run(`?[chunk_id, term] <- [${termRows}] :put doc_terms`)
        }

        // Collect chunks for batch embedding
        if (generateEmbeddings) {
          allChunks.push({ chunkId, content: chunk.content })
        }
      }

      // Add auto-generated tags based on doc type
      const tags = [doc.docType]
      if (doc.docType === 'adr') tags.push('decision')
      if (doc.docType === 'design') tags.push('architecture')
      if (doc.docType === 'readme') tags.push('overview')

      for (const tag of tags) {
        await agentDb.run(`
          ?[doc_id, tag] <- [[${escapeForCozo(doc.docId)}, ${escapeForCozo(tag)}]]
          :put doc_tags
        `)
      }

      log(`Indexed: ${path.relative(projectPath, doc.filePath)} (${doc.chunks.length} chunks)`)

    } catch (error) {
      console.error(`[Doc Indexer] Error indexing ${doc.filePath}:`, error)
    }
  }

  // Generate embeddings in batches
  if (generateEmbeddings && allChunks.length > 0) {
    log(`Generating embeddings for ${allChunks.length} chunks...`)

    const batchSize = 32
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize)

      try {
        // Filter out empty chunks and track which ones have valid content
        const validBatch = batch.filter(c => c.content && c.content.trim().length > 0)

        if (validBatch.length === 0) {
          log(`Batch ${i} has no valid content, skipping...`)
          continue
        }

        const embeddings = await embedTexts(validBatch.map(c => c.content))

        for (let j = 0; j < validBatch.length; j++) {
          const { chunkId } = validBatch[j]
          const embedding = embeddings[j]

          if (!embedding) {
            console.warn(`[Doc Indexer] Missing embedding for chunk ${chunkId}, skipping...`)
            continue
          }

          const vecBuffer = vectorToBuffer(embedding)
          const base64Vec = vecBuffer.toString('base64')

          await agentDb.run(`
            ?[chunk_id, vec] <- [[
              ${escapeForCozo(chunkId)},
              decode_base64('${base64Vec}')
            ]]
            :put doc_chunk_vec
          `)
          stats.embeddings++
        }

        log(`Generated embeddings: ${Math.min(i + batchSize, allChunks.length)}/${allChunks.length}`)
      } catch (error) {
        console.error(`[Doc Indexer] Error generating embeddings for batch ${i}:`, error)
      }
    }
  }

  log(`Indexing complete: ${stats.documents} documents, ${stats.sections} sections, ${stats.chunks} chunks, ${stats.embeddings} embeddings`)

  return stats
}

/**
 * Get documentation stats for a project
 */
export async function getDocStats(agentDb: AgentDatabase, projectPath?: string): Promise<{
  documents: number
  sections: number
  chunks: number
  embeddings: number
  byType: Record<string, number>
}> {
  try {
    let docCountQuery = `?[count(doc_id)] := *documents{doc_id}`
    let sectionCountQuery = `?[count(section_id)] := *doc_sections{section_id}`
    let chunkCountQuery = `?[count(chunk_id)] := *doc_chunks{chunk_id}`
    let embeddingCountQuery = `?[count(chunk_id)] := *doc_chunk_vec{chunk_id}`
    let typeBreakdownQuery = `?[doc_type, count(doc_id)] := *documents{doc_id, doc_type}`

    if (projectPath) {
      docCountQuery = `?[count(doc_id)] := *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}`
      typeBreakdownQuery = `?[doc_type, count(doc_id)] := *documents{doc_id, doc_type, project_path}, project_path = ${escapeForCozo(projectPath)}`
      // For sections/chunks/embeddings, we need to join with documents
      sectionCountQuery = `?[count(section_id)] := *doc_sections{section_id, doc_id}, *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}`
      chunkCountQuery = `?[count(chunk_id)] := *doc_chunks{chunk_id, doc_id}, *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}`
      embeddingCountQuery = `?[count(chunk_id)] := *doc_chunk_vec{chunk_id}, *doc_chunks{chunk_id, doc_id}, *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}`
    }

    const [docResult, sectionResult, chunkResult, embeddingResult, typeResult] = await Promise.all([
      agentDb.run(docCountQuery),
      agentDb.run(sectionCountQuery),
      agentDb.run(chunkCountQuery),
      agentDb.run(embeddingCountQuery),
      agentDb.run(typeBreakdownQuery),
    ])

    const byType: Record<string, number> = {}
    for (const row of typeResult.rows) {
      byType[row[0] as string] = row[1] as number
    }

    return {
      documents: docResult.rows[0]?.[0] || 0,
      sections: sectionResult.rows[0]?.[0] || 0,
      chunks: chunkResult.rows[0]?.[0] || 0,
      embeddings: embeddingResult.rows[0]?.[0] || 0,
      byType,
    }
  } catch (error: any) {
    // Tables might not exist yet
    return {
      documents: 0,
      sections: 0,
      chunks: 0,
      embeddings: 0,
      byType: {},
    }
  }
}

/**
 * Search documents by semantic similarity
 */
export async function searchDocsBySimilarity(
  agentDb: AgentDatabase,
  queryText: string,
  limit = 10,
  projectPath?: string
): Promise<Array<{
  chunkId: string
  docId: string
  filePath: string
  title: string
  docType: string
  heading?: string
  content: string
  similarity: number
}>> {
  const { cosine, bufferToVector } = await import('./embeddings')

  // Generate embedding for query
  const [queryVec] = await embedTexts([queryText])

  // Get all document embeddings
  let vectorsQuery = `?[chunk_id, vec] := *doc_chunk_vec{chunk_id, vec}`
  if (projectPath) {
    vectorsQuery = `?[chunk_id, vec] := *doc_chunk_vec{chunk_id, vec}, *doc_chunks{chunk_id, doc_id}, *documents{doc_id, project_path}, project_path = ${escapeForCozo(projectPath)}`
  }

  const vectorsResult = await agentDb.run(vectorsQuery)

  // Compute similarities
  const similarities: Array<{ chunkId: string; similarity: number }> = []

  for (const row of vectorsResult.rows) {
    const chunkId = row[0] as string
    const vec = bufferToVector(Buffer.from(row[1] as Uint8Array))
    const similarity = cosine(queryVec, vec)
    similarities.push({ chunkId, similarity })
  }

  // Sort by similarity and take top results
  similarities.sort((a, b) => b.similarity - a.similarity)
  const topChunks = similarities.slice(0, limit)

  // Fetch chunk details
  const results: Array<{
    chunkId: string
    docId: string
    filePath: string
    title: string
    docType: string
    heading?: string
    content: string
    similarity: number
  }> = []

  for (const { chunkId, similarity } of topChunks) {
    const chunkResult = await agentDb.run(`
      ?[chunk_id, doc_id, heading, content] :=
        *doc_chunks{chunk_id, doc_id, heading, content},
        chunk_id = ${escapeForCozo(chunkId)}
    `)

    if (chunkResult.rows.length === 0) continue

    const chunk = chunkResult.rows[0]
    const docId = chunk[1] as string

    const docResult = await agentDb.run(`
      ?[file_path, title, doc_type] :=
        *documents{doc_id, file_path, title, doc_type},
        doc_id = ${escapeForCozo(docId)}
    `)

    if (docResult.rows.length === 0) continue

    const doc = docResult.rows[0]

    results.push({
      chunkId,
      docId,
      filePath: doc[0] as string,
      title: doc[1] as string,
      docType: doc[2] as string,
      heading: chunk[2] as string | undefined,
      content: chunk[3] as string,
      similarity,
    })
  }

  return results
}

/**
 * Search documents by keyword
 */
export async function searchDocsByKeyword(
  agentDb: AgentDatabase,
  keyword: string,
  limit = 10,
  projectPath?: string
): Promise<Array<{
  chunkId: string
  docId: string
  filePath: string
  title: string
  docType: string
  heading?: string
  content: string
}>> {
  const term = keyword.toLowerCase()

  let query = `
    ?[chunk_id, doc_id, heading, content, file_path, title, doc_type] :=
      *doc_terms{chunk_id, term},
      term = ${escapeForCozo(term)},
      *doc_chunks{chunk_id, doc_id, heading, content},
      *documents{doc_id, file_path, title, doc_type}
  `

  if (projectPath) {
    query = `
      ?[chunk_id, doc_id, heading, content, file_path, title, doc_type] :=
        *doc_terms{chunk_id, term},
        term = ${escapeForCozo(term)},
        *doc_chunks{chunk_id, doc_id, heading, content},
        *documents{doc_id, file_path, title, doc_type, project_path},
        project_path = ${escapeForCozo(projectPath)}
    `
  }

  query += ` :limit ${limit}`

  const result = await agentDb.run(query)

  return result.rows.map((row: any[]) => ({
    chunkId: row[0],
    docId: row[1],
    heading: row[2],
    content: row[3],
    filePath: row[4],
    title: row[5],
    docType: row[6],
  }))
}

/**
 * Find documents by type
 */
export async function findDocsByType(
  agentDb: AgentDatabase,
  docType: string,
  projectPath?: string
): Promise<Array<{
  docId: string
  filePath: string
  title: string
  docType: string
}>> {
  let query = `
    ?[doc_id, file_path, title, doc_type] :=
      *documents{doc_id, file_path, title, doc_type},
      doc_type = ${escapeForCozo(docType)}
  `

  if (projectPath) {
    query = `
      ?[doc_id, file_path, title, doc_type] :=
        *documents{doc_id, file_path, title, doc_type, project_path},
        doc_type = ${escapeForCozo(docType)},
        project_path = ${escapeForCozo(projectPath)}
    `
  }

  const result = await agentDb.run(query)

  return result.rows.map((row: any[]) => ({
    docId: row[0],
    filePath: row[1],
    title: row[2],
    docType: row[3],
  }))
}

/**
 * Get document with all sections
 */
export async function getDocumentWithSections(
  agentDb: AgentDatabase,
  docId: string
): Promise<{
  doc: { docId: string; filePath: string; title: string; docType: string } | null
  sections: DocumentSection[]
}> {
  const docResult = await agentDb.run(`
    ?[doc_id, file_path, title, doc_type] :=
      *documents{doc_id, file_path, title, doc_type},
      doc_id = ${escapeForCozo(docId)}
  `)

  if (docResult.rows.length === 0) {
    return { doc: null, sections: [] }
  }

  const doc = {
    docId: docResult.rows[0][0] as string,
    filePath: docResult.rows[0][1] as string,
    title: docResult.rows[0][2] as string,
    docType: docResult.rows[0][3] as string,
  }

  const sectionsResult = await agentDb.run(`
    ?[section_id, heading, level, parent_section_id, content, char_start, char_end] :=
      *doc_sections{section_id, doc_id, heading, level, parent_section_id, content, char_start, char_end},
      doc_id = ${escapeForCozo(docId)}
    :order level, char_start
  `)

  const sections = sectionsResult.rows.map((row: any[]) => ({
    id: row[0],
    heading: row[1],
    level: row[2],
    parentId: row[3],
    content: row[4],
    charStart: row[5],
    charEnd: row[6],
  }))

  return { doc, sections }
}
