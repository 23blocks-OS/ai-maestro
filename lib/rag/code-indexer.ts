/**
 * Code Graph Indexer
 * Stores parsed code graph data into CozoDB
 * Supports TypeScript, JavaScript, Ruby, and Python projects
 */

import { AgentDatabase } from '@/lib/cozo-db'
import { ParsedFile as TSParsedFile, parseFiles } from './code-parser'
import { parseProject as parseProjectUnified, detectProjectType, getProjectInfo, ProjectInfo, AnyParsedFile, ProjectType } from './parsers'
import { codeId } from './id'

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
