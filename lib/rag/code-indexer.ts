/**
 * Code Graph Indexer
 * Stores parsed code graph data into CozoDB
 */

import { AgentDatabase } from '@/lib/cozo-db'
import { ParsedFile, parseProject, parseFiles } from './code-parser'
import { codeId } from './id'

export interface IndexStats {
  filesIndexed: number
  functionsIndexed: number
  componentsIndexed: number
  importsIndexed: number
  callsIndexed: number
  durationMs: number
}

/**
 * Index parsed files into CozoDB
 */
export async function indexParsedFiles(
  agentDb: AgentDatabase,
  parsedFiles: ParsedFile[],
  projectPath: string
): Promise<IndexStats> {
  const startTime = Date.now()
  const stats: IndexStats = {
    filesIndexed: 0,
    functionsIndexed: 0,
    componentsIndexed: 0,
    importsIndexed: 0,
    callsIndexed: 0,
    durationMs: 0,
  }

  console.log(`[CodeIndexer] Indexing ${parsedFiles.length} files...`)

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
      await agentDb.run(`
        ?[fn_id, name, file_id, is_export, lang] <- [[
          '${fn.fn_id}',
          '${escapeString(fn.name)}',
          '${fn.file_id}',
          ${fn.is_export},
          '${fn.lang}'
        ]]
        :put functions
      `)
      stats.functionsIndexed++

      // Insert declares edge
      await agentDb.run(`
        ?[file_id, fn_id] <- [['${fn.file_id}', '${fn.fn_id}']]
        :put declares {file_id, fn_id}
      `)

      // Insert function calls
      for (const calledFnName of fn.calls) {
        // Try to resolve called function to a fn_id
        // For now, we'll just store the call relationship by name
        // TODO: Improve resolution logic
        const callee_fn_id = codeId.fn(file.path, calledFnName)

        await agentDb.run(`
          ?[caller_fn, callee_fn] <- [['${fn.fn_id}', '${callee_fn_id}']]
          :put calls {caller_fn, callee_fn}
        `)
        stats.callsIndexed++
      }
    }

    // Insert components
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

      // Insert component_calls edges
      for (const calledFnName of comp.calls) {
        const fn_id = codeId.fn(file.path, calledFnName)

        await agentDb.run(`
          ?[component_id, fn_id] <- [['${comp.component_id}', '${fn_id}']]
          :put component_calls {component_id, fn_id}
        `)
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

  // Default exclude patterns
  const excludePatterns = options.excludePatterns || [
    'node_modules/**',
    '.next/**',
    'dist/**',
    'build/**',
    '.git/**',
    'coverage/**',
  ]

  // Parse project
  if (options.onProgress) options.onProgress('Parsing project files...')

  const parsedFiles = await parseProject(projectPath, {
    includePatterns: options.includePatterns,
    excludePatterns,
    onProgress: (filePath, index, total) => {
      if (options.onProgress && index % 10 === 0) {
        options.onProgress(`Parsing: ${index}/${total} files (${filePath})`)
      }
    },
  })

  // Index into CozoDB
  if (options.onProgress) options.onProgress('Indexing into database...')

  const stats = await indexParsedFiles(agentDb, parsedFiles, projectPath)

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
