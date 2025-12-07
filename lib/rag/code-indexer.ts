/**
 * Code Graph Indexer
 * Stores parsed code graph data into CozoDB
 * Supports TypeScript, JavaScript, Ruby, and Python projects
 */

import { AgentDatabase } from '@/lib/cozo-db'
import { ParsedFile as TSParsedFile, parseFiles } from './code-parser'
import { parseProject as parseProjectUnified, detectProjectType, getProjectInfo, ProjectInfo, AnyParsedFile, ProjectType } from './parsers'
import { codeId } from './id'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// Re-export project detection for API use
export { detectProjectType, getProjectInfo, type ProjectInfo, type ProjectType }

// Use the unified type for both parser outputs
type ParsedFile = AnyParsedFile

export interface IndexStats {
  filesIndexed: number
  functionsIndexed: number
  componentsIndexed: number
  classesIndexed: number
  importsIndexed: number
  callsIndexed: number
  durationMs: number
  projectType?: string
  framework?: string
}

export interface DeltaIndexStats extends IndexStats {
  filesNew: number
  filesModified: number
  filesDeleted: number
  filesUnchanged: number
}

export interface FileMetadata {
  file_id: string
  project_path: string
  content_hash: string
  mtime_ms: number
  size_bytes: number
  last_indexed_at: number
}

export interface FileChange {
  file_id: string
  path: string
  change_type: 'new' | 'modified' | 'deleted'
  current_hash?: string
  current_mtime?: number
  current_size?: number
}

/**
 * Index parsed files into CozoDB
 */
export async function indexParsedFiles(
  agentDb: AgentDatabase,
  parsedFiles: ParsedFile[],
  projectPath: string,
  projectInfo?: ProjectInfo
): Promise<IndexStats> {
  const startTime = Date.now()
  const stats: IndexStats = {
    filesIndexed: 0,
    functionsIndexed: 0,
    componentsIndexed: 0,
    classesIndexed: 0,
    importsIndexed: 0,
    callsIndexed: 0,
    durationMs: 0,
    projectType: projectInfo?.type,
    framework: projectInfo?.framework,
  }

  console.log(`[CodeIndexer] Indexing ${parsedFiles.length} files...`)

  // Build global maps for resolution
  const methodNameToIds: Map<string, string[]> = new Map()  // method_name -> [fn_id, ...]
  const classNameToId: Map<string, string> = new Map()       // class_name -> class_id

  // First pass: collect all functions and classes for global resolution
  for (const file of parsedFiles) {
    for (const fn of file.functions) {
      const name = fn.name
      if (!methodNameToIds.has(name)) {
        methodNameToIds.set(name, [])
      }
      methodNameToIds.get(name)!.push(fn.fn_id)
    }

    if ('classes' in file && file.classes) {
      for (const cls of file.classes) {
        classNameToId.set(cls.name, cls.class_id)
      }
    }

    if ('components' in file && file.components) {
      for (const comp of file.components) {
        classNameToId.set(comp.name, comp.component_id)
      }
    }
  }

  console.log(`[CodeIndexer] Built maps: ${methodNameToIds.size} methods, ${classNameToId.size} classes`)

  // Second pass: insert all data with proper resolution
  for (const file of parsedFiles) {
    // Insert file node
    await agentDb.run(`
      ?[file_id, path, module, project_path] <- [[
        '${file.file_id}',
        '${escapeString(file.path)}',
        '${escapeString(file.moduleName)}',
        '${escapeString(projectPath)}'
      ]]
      :put files
    `)
    stats.filesIndexed++

    // Insert functions
    for (const fn of file.functions) {
      // Handle both 'lang' (TS parser) and 'language' (unified parser) fields
      const lang = 'lang' in fn ? fn.lang : ('language' in fn ? fn.language : 'unknown')

      await agentDb.run(`
        ?[fn_id, name, file_id, is_export, lang] <- [[
          '${fn.fn_id}',
          '${escapeString(fn.name)}',
          '${fn.file_id}',
          ${fn.is_export},
          '${lang}'
        ]]
        :put functions
      `)
      stats.functionsIndexed++

      // Insert declares edge
      await agentDb.run(`
        ?[file_id, fn_id] <- [['${fn.file_id}', '${fn.fn_id}']]
        :put declares {file_id, fn_id}
      `)

      // Insert function calls with global resolution
      for (const calledFnName of fn.calls) {
        // Try to resolve to existing functions in the project
        const targetIds = methodNameToIds.get(calledFnName) || []

        if (targetIds.length > 0) {
          // Create edges to all matching functions (can't know which one without type info)
          for (const targetId of targetIds) {
            // Skip self-calls
            if (targetId === fn.fn_id) continue

            await agentDb.run(`
              ?[caller_fn, callee_fn] <- [['${fn.fn_id}', '${targetId}']]
              :put calls {caller_fn, callee_fn}
            `)
            stats.callsIndexed++
          }
        }
        // Don't create edges to non-existent functions
      }
    }

    // Insert components (TypeScript React components)
    if ('components' in file && file.components) {
      for (const comp of file.components) {
        await agentDb.run(`
          ?[component_id, name, file_id] <- [[
            '${comp.component_id}',
            '${escapeString(comp.name)}',
            '${comp.file_id}'
          ]]
          :put components
        `)
        stats.componentsIndexed++

        // Insert component_calls edges with global resolution
        for (const calledFnName of comp.calls) {
          const targetIds = methodNameToIds.get(calledFnName) || []
          for (const targetId of targetIds) {
            await agentDb.run(`
              ?[component_id, fn_id] <- [['${comp.component_id}', '${targetId}']]
              :put component_calls {component_id, fn_id}
            `)
          }
        }
      }
    }

    // Insert classes (Ruby/Python classes)
    if ('classes' in file && file.classes) {
      for (const cls of file.classes) {
        const classType = cls.class_type || 'class'
        await agentDb.run(`
          ?[component_id, name, file_id, class_type] <- [[
            '${cls.class_id}',
            '${escapeString(cls.name)}',
            '${cls.file_id}',
            '${classType}'
          ]]
          :put components
        `)
        stats.classesIndexed++

        // Insert inheritance edge if parent class exists
        if (cls.parent_class) {
          const parentId = classNameToId.get(cls.parent_class)
          if (parentId) {
            await agentDb.run(`
              ?[child_class, parent_class] <- [['${cls.class_id}', '${parentId}']]
              :put extends {child_class, parent_class}
            `)
          } else {
            // Parent class not in project - store as external reference
            await agentDb.run(`
              ?[child_class, parent_class] <- [['${cls.class_id}', 'external:${escapeString(cls.parent_class)}']]
              :put extends {child_class, parent_class}
            `)
          }
        }

        // Insert include edges for mixins
        if (cls.includes && cls.includes.length > 0) {
          for (const includedModule of cls.includes) {
            const moduleId = classNameToId.get(includedModule)
            await agentDb.run(`
              ?[class_id, module_name] <- [['${cls.class_id}', '${moduleId || 'external:' + escapeString(includedModule)}']]
              :put includes {class_id, module_name}
            `)
          }
        }

        // Insert association edges (belongs_to, has_many, etc.)
        if (cls.associations && cls.associations.length > 0) {
          for (const assoc of cls.associations) {
            const targetId = classNameToId.get(assoc.target)
            await agentDb.run(`
              ?[from_class, to_class, assoc_type] <- [['${cls.class_id}', '${targetId || 'external:' + escapeString(assoc.target)}', '${assoc.type}']]
              :put associations {from_class, to_class, assoc_type}
            `)
          }
        }

        // Insert serializer relationship
        if (cls.serializes) {
          const modelId = classNameToId.get(cls.serializes)
          if (modelId) {
            await agentDb.run(`
              ?[serializer_id, model_id] <- [['${cls.class_id}', '${modelId}']]
              :put serializes {serializer_id, model_id}
            `)
          }
        }
      }
    }

    // Insert imports
    for (const imp of file.imports) {
      // Resolve module to file_id if it's a relative import
      let to_file_id: string
      if (imp.to_module.startsWith('.')) {
        // Relative import - resolve to file path
        const resolvedPath = resolveRelativeImport(file.path, imp.to_module)
        to_file_id = codeId.file(resolvedPath)
      } else {
        // External module - use module name as ID
        to_file_id = `module:${imp.to_module}`
      }

      await agentDb.run(`
        ?[from_file, to_file] <- [['${imp.from_file}', '${to_file_id}']]
        :put imports {from_file, to_file}
      `)
      stats.importsIndexed++
    }
  }

  stats.durationMs = Date.now() - startTime

  console.log(`[CodeIndexer] ✅ Indexing complete in ${stats.durationMs}ms`)
  console.log(`[CodeIndexer] Stats:`, stats)

  return stats
}

/**
 * Index entire project
 * Auto-detects project type and uses appropriate parser
 */
export async function indexProject(
  agentDb: AgentDatabase,
  projectPath: string,
  options: {
    includePatterns?: string[]
    excludePatterns?: string[]
    onProgress?: (status: string) => void
  } = {}
): Promise<IndexStats> {
  console.log(`[CodeIndexer] Starting full project index: ${projectPath}`)

  // Detect project type
  const projectInfo = getProjectInfo(projectPath)
  console.log(`[CodeIndexer] Detected project type: ${projectInfo.type}${projectInfo.framework ? ` (${projectInfo.framework})` : ''}`)

  if (options.onProgress) {
    options.onProgress(`Detected ${projectInfo.type}${projectInfo.framework ? ` (${projectInfo.framework})` : ''} project`)
  }

  // Parse project using unified parser
  if (options.onProgress) options.onProgress('Parsing project files...')

  const { files: parsedFiles } = await parseProjectUnified(projectPath, {
    includePatterns: options.includePatterns,
    excludePatterns: options.excludePatterns,
    onProgress: (filePath, index, total) => {
      if (options.onProgress && index % 10 === 0) {
        options.onProgress(`Parsing: ${index}/${total} files (${filePath})`)
      }
    },
  })

  // Index into CozoDB
  if (options.onProgress) options.onProgress('Indexing into database...')

  const stats = await indexParsedFiles(agentDb, parsedFiles, projectPath, projectInfo)

  if (options.onProgress) options.onProgress('✅ Indexing complete')

  return stats
}

/**
 * Index specific files (for incremental updates)
 */
export async function indexFiles(
  agentDb: AgentDatabase,
  projectPath: string,
  filePaths: string[]
): Promise<IndexStats> {
  console.log(`[CodeIndexer] Incremental index: ${filePaths.length} files`)

  const parsedFiles = await parseFiles(projectPath, filePaths)
  const stats = await indexParsedFiles(agentDb, parsedFiles, projectPath)

  return stats
}

/**
 * Clear code graph data for a project (before re-indexing)
 */
export async function clearCodeGraph(
  agentDb: AgentDatabase,
  projectPath: string
): Promise<void> {
  console.log(`[CodeIndexer] Clearing code graph for project: ${projectPath}`)

  // Delete files and cascading relationships
  await agentDb.run(`
    ?[file_id] := *files{file_id, project_path}, project_path = '${escapeString(projectPath)}'
    :rm files {file_id}
  `)

  // Note: Due to foreign keys, functions/components/imports should cascade delete
  // If not, we need to explicitly delete them
  await agentDb.run(`
    ?[fn_id] := *functions{fn_id, file_id}, *files{file_id, project_path}, project_path = '${escapeString(projectPath)}'
    :rm functions {fn_id}
  `)

  await agentDb.run(`
    ?[component_id] := *components{component_id, file_id}, *files{file_id, project_path}, project_path = '${escapeString(projectPath)}'
    :rm components {component_id}
  `)

  console.log(`[CodeIndexer] Code graph cleared`)
}

/**
 * Query code graph
 */
export async function queryCodeGraph(
  agentDb: AgentDatabase,
  query: string
): Promise<any> {
  return await agentDb.run(query)
}

/**
 * Find functions by name
 */
export async function findFunctions(
  agentDb: AgentDatabase,
  namePattern: string
): Promise<Array<{ fn_id: string; name: string; file_id: string }>> {
  const result = await agentDb.run(`
    ?[fn_id, name, file_id] :=
      *functions{fn_id, name, file_id},
      name ~~ '${escapeString(namePattern)}'
  `)

  return result.rows.map((row: any[]) => ({
    fn_id: row[0],
    name: row[1],
    file_id: row[2],
  }))
}

/**
 * Find call chain between two functions
 */
export async function findCallChain(
  agentDb: AgentDatabase,
  fromFnName: string,
  toFnName: string
): Promise<any> {
  // Use Datalog recursive query to find call paths
  const result = await agentDb.run(`
    # Find all paths from fromFn to toFn
    path[caller, callee, depth] :=
      *functions{fn_id: caller, name},
      name = '${escapeString(fromFnName)}',
      *calls{caller_fn: caller, callee_fn: callee},
      depth = 1

    path[start, end, depth] :=
      path[start, mid, d1],
      *calls{caller_fn: mid, callee_fn: end},
      depth = d1 + 1,
      depth <= 10  # Limit depth to prevent infinite loops

    ?[caller, callee, depth] :=
      path[caller, callee, depth],
      *functions{fn_id: callee, name},
      name = '${escapeString(toFnName)}'

    :order depth
    :limit 10
  `)

  return result
}

/**
 * Get function dependencies (what it calls)
 */
export async function getFunctionDependencies(
  agentDb: AgentDatabase,
  fnName: string
): Promise<Array<string>> {
  const result = await agentDb.run(`
    ?[callee_name] :=
      *functions{fn_id: caller, name: caller_name},
      caller_name = '${escapeString(fnName)}',
      *calls{caller_fn: caller, callee_fn: callee},
      *functions{fn_id: callee, name: callee_name}
  `)

  return result.rows.map((row: any[]) => row[0])
}

/**
 * Escape single quotes in strings for CozoDB
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}

/**
 * Resolve relative import path
 * Example: from 'lib/rag/embeddings.ts' import './keywords' → 'lib/rag/keywords.ts'
 */
function resolveRelativeImport(fromPath: string, importPath: string): string {
  const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'))
  const resolved = importPath.replace(/^\.\//, `${fromDir}/`).replace(/^\.\.\//, '')

  // Add .ts extension if missing
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx') &&
      !resolved.endsWith('.js') && !resolved.endsWith('.jsx')) {
    return resolved + '.ts'
  }

  return resolved
}

// ============================================================================
// DELTA INDEXING FUNCTIONS
// ============================================================================

/**
 * Compute SHA256 hash of file content
 */
export function computeFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return crypto.createHash('sha256').update(content).digest('hex')
  } catch (error) {
    console.error(`[CodeIndexer] Failed to hash file: ${filePath}`, error)
    return ''
  }
}

/**
 * Get file stats (mtime, size)
 */
export function getFileStats(filePath: string): { mtime_ms: number; size_bytes: number } | null {
  try {
    const stats = fs.statSync(filePath)
    return {
      mtime_ms: Math.floor(stats.mtimeMs),
      size_bytes: stats.size,
    }
  } catch (error) {
    return null
  }
}

/**
 * Get stored file metadata for a project from CozoDB
 */
export async function getProjectFileMetadata(
  agentDb: AgentDatabase,
  projectPath: string
): Promise<FileMetadata[]> {
  try {
    const result = await agentDb.run(`
      ?[file_id, project_path, content_hash, mtime_ms, size_bytes, last_indexed_at] :=
        *file_metadata{file_id, project_path, content_hash, mtime_ms, size_bytes, last_indexed_at},
        project_path = '${escapeString(projectPath)}'
    `)

    return result.rows.map((row: any[]) => ({
      file_id: row[0],
      project_path: row[1],
      content_hash: row[2],
      mtime_ms: row[3],
      size_bytes: row[4],
      last_indexed_at: row[5],
    }))
  } catch (error: any) {
    // Table might not exist yet
    if (error.code === 'eval::unknown_relation') {
      return []
    }
    throw error
  }
}

/**
 * Upsert file metadata into CozoDB
 */
export async function upsertFileMetadata(
  agentDb: AgentDatabase,
  metadata: FileMetadata
): Promise<void> {
  await agentDb.run(`
    ?[file_id, project_path, content_hash, mtime_ms, size_bytes, last_indexed_at] <- [[
      '${metadata.file_id}',
      '${escapeString(metadata.project_path)}',
      '${metadata.content_hash}',
      ${metadata.mtime_ms},
      ${metadata.size_bytes},
      ${metadata.last_indexed_at}
    ]]
    :put file_metadata
  `)
}

/**
 * Delete file metadata from CozoDB
 */
export async function deleteFileMetadata(
  agentDb: AgentDatabase,
  fileId: string
): Promise<void> {
  await agentDb.run(`
    ?[file_id] <- [['${fileId}']]
    :rm file_metadata {file_id}
  `)
}

/**
 * Remove graph data for a specific file (before re-indexing)
 */
export async function removeFileGraphData(
  agentDb: AgentDatabase,
  fileId: string
): Promise<void> {
  // Remove functions declared in this file
  await agentDb.run(`
    ?[fn_id] := *functions{fn_id, file_id}, file_id = '${fileId}'
    :rm functions {fn_id}
  `)

  // Remove components from this file
  await agentDb.run(`
    ?[component_id] := *components{component_id, file_id}, file_id = '${fileId}'
    :rm components {component_id}
  `)

  // Remove imports from this file
  await agentDb.run(`
    ?[from_file, to_file] := *imports{from_file, to_file}, from_file = '${fileId}'
    :rm imports {from_file, to_file}
  `)

  // Remove declares edges for this file
  await agentDb.run(`
    ?[file_id, fn_id] := *declares{file_id, fn_id}, file_id = '${fileId}'
    :rm declares {file_id, fn_id}
  `)

  // Remove the file itself
  await agentDb.run(`
    ?[file_id] <- [['${fileId}']]
    :rm files {file_id}
  `)

  // Note: calls edges are based on fn_id, so they'll become dangling
  // but that's okay - they won't match any function
}

/**
 * Detect file changes between filesystem and database
 */
export async function detectFileChanges(
  agentDb: AgentDatabase,
  projectPath: string,
  currentFilePaths: string[]
): Promise<{
  newFiles: FileChange[]
  modifiedFiles: FileChange[]
  deletedFiles: FileChange[]
  unchangedFiles: string[]
}> {
  console.log(`[CodeIndexer] Detecting file changes for ${currentFilePaths.length} files...`)

  // Get stored metadata for this project
  const storedMetadata = await getProjectFileMetadata(agentDb, projectPath)
  const storedByFileId = new Map<string, FileMetadata>()
  for (const meta of storedMetadata) {
    storedByFileId.set(meta.file_id, meta)
  }

  const newFiles: FileChange[] = []
  const modifiedFiles: FileChange[] = []
  const unchangedFiles: string[] = []
  const seenFileIds = new Set<string>()

  // Check each current file
  for (const filePath of currentFilePaths) {
    const relativePath = filePath.startsWith(projectPath)
      ? filePath.substring(projectPath.length + 1)
      : filePath
    const fileId = codeId.file(relativePath)
    seenFileIds.add(fileId)

    const stats = getFileStats(filePath)
    if (!stats) {
      console.warn(`[CodeIndexer] Could not stat file: ${filePath}`)
      continue
    }

    const stored = storedByFileId.get(fileId)

    if (!stored) {
      // New file
      const hash = computeFileHash(filePath)
      newFiles.push({
        file_id: fileId,
        path: relativePath,
        change_type: 'new',
        current_hash: hash,
        current_mtime: stats.mtime_ms,
        current_size: stats.size_bytes,
      })
    } else {
      // File exists in DB - check if modified
      // Quick check: compare mtime and size first (fast)
      if (stats.mtime_ms > stored.mtime_ms || stats.size_bytes !== stored.size_bytes) {
        // Potentially modified - verify with hash
        const hash = computeFileHash(filePath)
        if (hash !== stored.content_hash) {
          modifiedFiles.push({
            file_id: fileId,
            path: relativePath,
            change_type: 'modified',
            current_hash: hash,
            current_mtime: stats.mtime_ms,
            current_size: stats.size_bytes,
          })
        } else {
          // mtime changed but content same - update mtime in DB
          unchangedFiles.push(fileId)
        }
      } else {
        unchangedFiles.push(fileId)
      }
    }
  }

  // Find deleted files (in DB but not in filesystem)
  const deletedFiles: FileChange[] = []
  for (const [fileId, meta] of storedByFileId) {
    if (!seenFileIds.has(fileId)) {
      // Get the path from the files table
      try {
        const result = await agentDb.run(`
          ?[path] := *files{file_id, path}, file_id = '${fileId}'
        `)
        const filePath = result.rows.length > 0 ? result.rows[0][0] : fileId
        deletedFiles.push({
          file_id: fileId,
          path: filePath,
          change_type: 'deleted',
        })
      } catch {
        deletedFiles.push({
          file_id: fileId,
          path: fileId,
          change_type: 'deleted',
        })
      }
    }
  }

  console.log(`[CodeIndexer] Changes detected: ${newFiles.length} new, ${modifiedFiles.length} modified, ${deletedFiles.length} deleted, ${unchangedFiles.length} unchanged`)

  return { newFiles, modifiedFiles, deletedFiles, unchangedFiles }
}

/**
 * Delta index a project - only re-index changed files
 */
export async function indexProjectDelta(
  agentDb: AgentDatabase,
  projectPath: string,
  options: {
    includePatterns?: string[]
    excludePatterns?: string[]
    onProgress?: (status: string) => void
  } = {}
): Promise<DeltaIndexStats> {
  const startTime = Date.now()
  console.log(`[CodeIndexer] Starting delta project index: ${projectPath}`)

  // Detect project type
  const projectInfo = getProjectInfo(projectPath)
  console.log(`[CodeIndexer] Detected project type: ${projectInfo.type}${projectInfo.framework ? ` (${projectInfo.framework})` : ''}`)

  if (options.onProgress) {
    options.onProgress(`Detected ${projectInfo.type}${projectInfo.framework ? ` (${projectInfo.framework})` : ''} project`)
  }

  // Scan for all current files in project
  if (options.onProgress) options.onProgress('Scanning project files...')
  const { files: allParsedFiles } = await parseProjectUnified(projectPath, {
    includePatterns: options.includePatterns,
    excludePatterns: options.excludePatterns,
    onProgress: (filePath, index, total) => {
      if (options.onProgress && index % 50 === 0) {
        options.onProgress(`Scanning: ${index}/${total} files`)
      }
    },
  })

  // Get full file paths for change detection
  const currentFilePaths = allParsedFiles.map(f =>
    path.isAbsolute(f.path) ? f.path : path.join(projectPath, f.path)
  )

  // Detect what changed
  if (options.onProgress) options.onProgress('Detecting changes...')
  const { newFiles, modifiedFiles, deletedFiles, unchangedFiles } = await detectFileChanges(
    agentDb,
    projectPath,
    currentFilePaths
  )

  const stats: DeltaIndexStats = {
    filesIndexed: 0,
    functionsIndexed: 0,
    componentsIndexed: 0,
    classesIndexed: 0,
    importsIndexed: 0,
    callsIndexed: 0,
    durationMs: 0,
    projectType: projectInfo.type,
    framework: projectInfo.framework,
    filesNew: newFiles.length,
    filesModified: modifiedFiles.length,
    filesDeleted: deletedFiles.length,
    filesUnchanged: unchangedFiles.length,
  }

  // If no changes, we're done
  if (newFiles.length === 0 && modifiedFiles.length === 0 && deletedFiles.length === 0) {
    console.log('[CodeIndexer] No changes detected, skipping index')
    if (options.onProgress) options.onProgress('✅ No changes detected')
    stats.durationMs = Date.now() - startTime
    return stats
  }

  // Handle deleted files
  if (deletedFiles.length > 0) {
    if (options.onProgress) options.onProgress(`Removing ${deletedFiles.length} deleted files...`)
    for (const deleted of deletedFiles) {
      await removeFileGraphData(agentDb, deleted.file_id)
      await deleteFileMetadata(agentDb, deleted.file_id)
    }
  }

  // Handle modified files (remove old data first)
  if (modifiedFiles.length > 0) {
    if (options.onProgress) options.onProgress(`Removing old data for ${modifiedFiles.length} modified files...`)
    for (const modified of modifiedFiles) {
      await removeFileGraphData(agentDb, modified.file_id)
    }
  }

  // Get parsed files for new and modified files only
  const changedFileIds = new Set([
    ...newFiles.map(f => f.file_id),
    ...modifiedFiles.map(f => f.file_id),
  ])

  const filesToIndex = allParsedFiles.filter(f => changedFileIds.has(f.file_id))

  if (filesToIndex.length > 0) {
    if (options.onProgress) options.onProgress(`Indexing ${filesToIndex.length} changed files...`)

    // Index the changed files
    const indexStats = await indexParsedFiles(agentDb, filesToIndex, projectPath, projectInfo)

    stats.filesIndexed = indexStats.filesIndexed
    stats.functionsIndexed = indexStats.functionsIndexed
    stats.componentsIndexed = indexStats.componentsIndexed
    stats.classesIndexed = indexStats.classesIndexed
    stats.importsIndexed = indexStats.importsIndexed
    stats.callsIndexed = indexStats.callsIndexed

    // Update file metadata for indexed files
    const now = Date.now()
    for (const change of [...newFiles, ...modifiedFiles]) {
      if (change.current_hash && change.current_mtime && change.current_size) {
        await upsertFileMetadata(agentDb, {
          file_id: change.file_id,
          project_path: projectPath,
          content_hash: change.current_hash,
          mtime_ms: change.current_mtime,
          size_bytes: change.current_size,
          last_indexed_at: now,
        })
      }
    }
  }

  stats.durationMs = Date.now() - startTime

  console.log(`[CodeIndexer] ✅ Delta indexing complete in ${stats.durationMs}ms`)
  console.log(`[CodeIndexer] Stats:`, stats)

  if (options.onProgress) {
    options.onProgress(`✅ Delta complete: ${stats.filesNew} new, ${stats.filesModified} modified, ${stats.filesDeleted} deleted`)
  }

  return stats
}

/**
 * Initialize file metadata for existing indexed files (migration helper)
 * Call this after full index to populate metadata for delta tracking
 */
export async function initializeFileMetadata(
  agentDb: AgentDatabase,
  projectPath: string
): Promise<number> {
  console.log(`[CodeIndexer] Initializing file metadata for project: ${projectPath}`)

  // Get all files in the project from the database
  const result = await agentDb.run(`
    ?[file_id, path] := *files{file_id, path, project_path}, project_path = '${escapeString(projectPath)}'
  `)

  const now = Date.now()
  let count = 0

  for (const row of result.rows) {
    const fileId = row[0]
    const relativePath = row[1]
    const fullPath = path.join(projectPath, relativePath)

    const stats = getFileStats(fullPath)
    if (!stats) {
      console.warn(`[CodeIndexer] Could not stat file: ${fullPath}`)
      continue
    }

    const hash = computeFileHash(fullPath)
    if (!hash) continue

    await upsertFileMetadata(agentDb, {
      file_id: fileId,
      project_path: projectPath,
      content_hash: hash,
      mtime_ms: stats.mtime_ms,
      size_bytes: stats.size_bytes,
      last_indexed_at: now,
    })

    count++
  }

  console.log(`[CodeIndexer] Initialized metadata for ${count} files`)
  return count
}
