import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { getAgent as getAgentFromRegistry } from '@/lib/agent-registry'
import {
  indexProject,
  indexProjectDelta,
  clearCodeGraph,
  findFunctions,
  findCallChain,
  getFunctionDependencies,
  initializeFileMetadata,
  getProjectFileMetadata,
  DeltaIndexStats,
} from '@/lib/rag/code-indexer'

/**
 * GET /api/agents/:id/graph/code
 * Query the code graph for an agent
 *
 * Query parameters:
 * - action: Query action (stats | functions | call-chain | dependencies | files | all)
 * - name: Function/file name pattern (for functions, call-chain, dependencies)
 * - from: Starting function name (for call-chain)
 * - to: Ending function name (for call-chain)
 * - project: Project path filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const action = searchParams.get('action') || 'stats'

    console.log(`[Code Graph API] Agent: ${agentId}, Action: ${action}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (action) {
      case 'stats': {
        // Get counts for all code graph tables
        const filesResult = await agentDb.run(`?[count(file_id)] := *files{file_id}`)
        const functionsResult = await agentDb.run(`?[count(fn_id)] := *functions{fn_id}`)
        const componentsResult = await agentDb.run(`?[count(component_id)] := *components{component_id}`)
        const importsResult = await agentDb.run(`?[count(from_file)] := *imports{from_file}`)
        const callsResult = await agentDb.run(`?[count(caller_fn)] := *calls{caller_fn}`)

        // Get breakdown by class_type
        let classTypeBreakdown: Record<string, number> = {}
        try {
          const classTypesResult = await agentDb.run(`
            ?[class_type, count(component_id)] := *components{component_id, class_type}, class_type != null
          `)
          for (const row of classTypesResult.rows) {
            classTypeBreakdown[row[0] as string] = row[1] as number
          }
        } catch {
          // class_type column may not exist in older schemas
        }

        // Get edge counts
        let extendsCount = 0, includesCount = 0, associationsCount = 0, serializesCount = 0
        try {
          const extendsResult = await agentDb.run(`?[count(child_class)] := *extends{child_class}`)
          extendsCount = extendsResult.rows[0]?.[0] || 0
        } catch { /* table may not exist */ }
        try {
          const includesResult = await agentDb.run(`?[count(class_id)] := *includes{class_id}`)
          includesCount = includesResult.rows[0]?.[0] || 0
        } catch { /* table may not exist */ }
        try {
          const associationsResult = await agentDb.run(`?[count(from_class)] := *associations{from_class}`)
          associationsCount = associationsResult.rows[0]?.[0] || 0
        } catch { /* table may not exist */ }
        try {
          const serializesResult = await agentDb.run(`?[count(serializer_id)] := *serializes{serializer_id}`)
          serializesCount = serializesResult.rows[0]?.[0] || 0
        } catch { /* table may not exist */ }

        result = {
          files: filesResult.rows[0]?.[0] || 0,
          functions: functionsResult.rows[0]?.[0] || 0,
          components: componentsResult.rows[0]?.[0] || 0,
          imports: importsResult.rows[0]?.[0] || 0,
          calls: callsResult.rows[0]?.[0] || 0,
          // Breakdown by class type
          classTypes: classTypeBreakdown,
          // Edge counts
          edges: {
            extends: extendsCount,
            includes: includesCount,
            associations: associationsCount,
            serializes: serializesCount,
          }
        }
        break
      }

      case 'functions': {
        const namePattern = searchParams.get('name') || '%'
        result = await findFunctions(agentDb, namePattern)
        break
      }

      case 'call-chain': {
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (!from || !to) {
          return NextResponse.json(
            { success: false, error: 'call-chain requires "from" and "to" parameters' },
            { status: 400 }
          )
        }
        result = await findCallChain(agentDb, from, to)
        break
      }

      case 'dependencies': {
        const fnName = searchParams.get('name')
        if (!fnName) {
          return NextResponse.json(
            { success: false, error: 'dependencies requires "name" parameter' },
            { status: 400 }
          )
        }
        result = await getFunctionDependencies(agentDb, fnName)
        break
      }

      case 'files': {
        const projectFilter = searchParams.get('project')
        let query = `?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}`
        if (projectFilter) {
          query += `, project_path = '${projectFilter.replace(/'/g, "''")}'`
        }
        const filesData = await agentDb.run(query)
        result = filesData.rows.map((row: any[]) => ({
          file_id: row[0],
          path: row[1],
          module: row[2],
          project_path: row[3],
        }))
        break
      }

      case 'all': {
        // Return full graph data for visualization
        const files = await agentDb.run(`?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}`)
        const functions = await agentDb.run(`?[fn_id, name, file_id, is_export, lang] := *functions{fn_id, name, file_id, is_export, lang}`)
        // Try to get class_type, fall back to basic query if column doesn't exist
        let components: any
        try {
          components = await agentDb.run(`?[component_id, name, file_id, class_type] := *components{component_id, name, file_id, class_type}`)
        } catch {
          components = await agentDb.run(`?[component_id, name, file_id] := *components{component_id, name, file_id}`)
        }
        const imports = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}`)
        const calls = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}`)

        // Fetch new edge types (with error handling for missing tables)
        let extendsEdges: any[] = []
        let includesEdges: any[] = []
        let associationEdges: any[] = []
        let serializesEdges: any[] = []

        try {
          const extendsResult = await agentDb.run(`?[child_class, parent_class] := *extends{child_class, parent_class}`)
          extendsEdges = extendsResult.rows
        } catch { /* table may not exist */ }

        try {
          const includesResult = await agentDb.run(`?[class_id, module_name] := *includes{class_id, module_name}`)
          includesEdges = includesResult.rows
        } catch { /* table may not exist */ }

        try {
          const associationsResult = await agentDb.run(`?[from_class, to_class, assoc_type] := *associations{from_class, to_class, assoc_type}`)
          associationEdges = associationsResult.rows
        } catch { /* table may not exist */ }

        try {
          const serializesResult = await agentDb.run(`?[serializer_id, model_id] := *serializes{serializer_id, model_id}`)
          serializesEdges = serializesResult.rows
        } catch { /* table may not exist */ }

        result = {
          nodes: {
            files: files.rows.map((r: any[]) => ({ id: r[0], path: r[1], module: r[2], project: r[3], type: 'file' })),
            functions: functions.rows.map((r: any[]) => ({ id: r[0], name: r[1], file_id: r[2], is_export: r[3], lang: r[4], type: 'function' })),
            components: components.rows.map((r: any[]) => ({
              id: r[0],
              name: r[1],
              file_id: r[2],
              class_type: r[3] || 'class',  // class_type if available
              type: 'component'
            })),
          },
          edges: {
            imports: imports.rows.map((r: any[]) => ({ source: r[0], target: r[1], type: 'imports' })),
            calls: calls.rows.map((r: any[]) => ({ source: r[0], target: r[1], type: 'calls' })),
            extends: extendsEdges.map((r: any[]) => ({ source: r[0], target: r[1], type: 'extends' })),
            includes: includesEdges.map((r: any[]) => ({ source: r[0], target: r[1], type: 'includes' })),
            associations: associationEdges.map((r: any[]) => ({ source: r[0], target: r[1], assoc_type: r[2], type: 'association' })),
            serializes: serializesEdges.map((r: any[]) => ({ source: r[0], target: r[1], type: 'serializes' })),
          },
        }
        break
      }

      case 'focus': {
        // Get all relationships for a specific node (for focus mode)
        const nodeId = searchParams.get('nodeId')
        const depth = parseInt(searchParams.get('depth') || '1', 10)

        if (!nodeId) {
          return NextResponse.json(
            { success: false, error: 'focus requires "nodeId" parameter' },
            { status: 400 }
          )
        }

        console.log(`[Code Graph API] Focus on node: ${nodeId}, depth: ${depth}`)

        // Collect all related node IDs
        const relatedNodeIds = new Set<string>([nodeId])
        const edges: any[] = []

        // Helper to add edge and collect node IDs
        const addEdge = (source: string, target: string, type: string, extra?: any) => {
          relatedNodeIds.add(source)
          relatedNodeIds.add(target)
          edges.push({ source, target, type, ...extra })
        }

        // Find edges where this node is source or target
        // 1. Function calls
        try {
          const callsOut = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, caller_fn = '${nodeId.replace(/'/g, "''")}'`)
          const callsIn = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, callee_fn = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...callsOut.rows, ...callsIn.rows]) {
            addEdge(r[0], r[1], 'calls')
          }
        } catch { /* table may not exist */ }

        // 2. Imports
        try {
          const importsOut = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}, from_file = '${nodeId.replace(/'/g, "''")}'`)
          const importsIn = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}, to_file = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...importsOut.rows, ...importsIn.rows]) {
            addEdge(r[0], r[1], 'imports')
          }
        } catch { /* table may not exist */ }

        // 3. Extends (inheritance)
        try {
          const extendsOut = await agentDb.run(`?[child_class, parent_class] := *extends{child_class, parent_class}, child_class = '${nodeId.replace(/'/g, "''")}'`)
          const extendsIn = await agentDb.run(`?[child_class, parent_class] := *extends{child_class, parent_class}, parent_class = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...extendsOut.rows, ...extendsIn.rows]) {
            addEdge(r[0], r[1], 'extends')
          }
        } catch { /* table may not exist */ }

        // 4. Includes (mixins)
        try {
          const includesOut = await agentDb.run(`?[class_id, module_name] := *includes{class_id, module_name}, class_id = '${nodeId.replace(/'/g, "''")}'`)
          const includesIn = await agentDb.run(`?[class_id, module_name] := *includes{class_id, module_name}, module_name = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...includesOut.rows, ...includesIn.rows]) {
            addEdge(r[0], r[1], 'includes')
          }
        } catch { /* table may not exist */ }

        // 5. Associations
        try {
          const assocsOut = await agentDb.run(`?[from_class, to_class, assoc_type] := *associations{from_class, to_class, assoc_type}, from_class = '${nodeId.replace(/'/g, "''")}'`)
          const assocsIn = await agentDb.run(`?[from_class, to_class, assoc_type] := *associations{from_class, to_class, assoc_type}, to_class = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...assocsOut.rows, ...assocsIn.rows]) {
            addEdge(r[0], r[1], 'association', { assoc_type: r[2] })
          }
        } catch { /* table may not exist */ }

        // 6. Serializes
        try {
          const serializesOut = await agentDb.run(`?[serializer_id, model_id] := *serializes{serializer_id, model_id}, serializer_id = '${nodeId.replace(/'/g, "''")}'`)
          const serializesIn = await agentDb.run(`?[serializer_id, model_id] := *serializes{serializer_id, model_id}, model_id = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...serializesOut.rows, ...serializesIn.rows]) {
            addEdge(r[0], r[1], 'serializes')
          }
        } catch { /* table may not exist */ }

        // 7. Declares (file -> function)
        try {
          const declaresOut = await agentDb.run(`?[file_id, fn_id] := *declares{file_id, fn_id}, file_id = '${nodeId.replace(/'/g, "''")}'`)
          const declaresIn = await agentDb.run(`?[file_id, fn_id] := *declares{file_id, fn_id}, fn_id = '${nodeId.replace(/'/g, "''")}'`)
          for (const r of [...declaresOut.rows, ...declaresIn.rows]) {
            addEdge(r[0], r[1], 'declares')
          }
        } catch { /* table may not exist */ }

        // Now fetch the actual node data for all related nodes
        const nodeIdsArray = Array.from(relatedNodeIds)
        const nodes: any[] = []

        // Fetch files
        for (const id of nodeIdsArray) {
          try {
            const fileResult = await agentDb.run(`?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}, file_id = '${id.replace(/'/g, "''")}'`)
            if (fileResult.rows.length > 0) {
              const r = fileResult.rows[0]
              nodes.push({ id: r[0], path: r[1], module: r[2], project: r[3], type: 'file' })
            }
          } catch { /* ignore */ }
        }

        // Fetch functions
        for (const id of nodeIdsArray) {
          try {
            const fnResult = await agentDb.run(`?[fn_id, name, file_id, is_export, lang] := *functions{fn_id, name, file_id, is_export, lang}, fn_id = '${id.replace(/'/g, "''")}'`)
            if (fnResult.rows.length > 0) {
              const r = fnResult.rows[0]
              nodes.push({ id: r[0], name: r[1], file_id: r[2], is_export: r[3], lang: r[4], type: 'function' })
            }
          } catch { /* ignore */ }
        }

        // Fetch components
        for (const id of nodeIdsArray) {
          try {
            let compResult: any
            try {
              compResult = await agentDb.run(`?[component_id, name, file_id, class_type] := *components{component_id, name, file_id, class_type}, component_id = '${id.replace(/'/g, "''")}'`)
            } catch {
              compResult = await agentDb.run(`?[component_id, name, file_id] := *components{component_id, name, file_id}, component_id = '${id.replace(/'/g, "''")}'`)
            }
            if (compResult.rows.length > 0) {
              const r = compResult.rows[0]
              nodes.push({ id: r[0], name: r[1], file_id: r[2], class_type: r[3] || 'class', type: 'component' })
            }
          } catch { /* ignore */ }
        }

        result = {
          focusNodeId: nodeId,
          depth,
          nodes,
          edges,
        }
        break
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      action,
      result,
    })
  } catch (error) {
    console.error('[Code Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/graph/code
 * Index a project's code into the graph
 *
 * Body (optional):
 * - projectPath: Path to the project to index (auto-detected from agent config if not provided)
 * - delta: Whether to do delta indexing (only changed files) (default: false)
 * - clear: Whether to clear existing data first (default: true, ignored when delta=true)
 * - initMetadata: Initialize file metadata for existing indexed files (for migration)
 * - includePatterns: Glob patterns to include (optional)
 * - excludePatterns: Glob patterns to exclude (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Parse body - handle empty body gracefully
    let body: any = {}
    try {
      const text = await request.text()
      if (text && text.trim()) {
        body = JSON.parse(text)
      }
    } catch {
      // Empty or invalid body - use defaults
    }

    let { projectPath, delta = false, clear = true, initMetadata = false, includePatterns, excludePatterns } = body

    // Auto-detect projectPath from agent registry if not provided
    if (!projectPath) {
      const registryAgent = getAgentFromRegistry(agentId)
      if (!registryAgent) {
        return NextResponse.json(
          { success: false, error: `Agent not found in registry: ${agentId}` },
          { status: 404 }
        )
      }

      // Try to get working directory from various sources in registry data
      projectPath = registryAgent.tools?.session?.workingDirectory ||
                    registryAgent.preferences?.defaultWorkingDirectory

      if (!projectPath) {
        return NextResponse.json(
          { success: false, error: 'No projectPath provided and agent has no configured working directory' },
          { status: 400 }
        )
      }

      console.log(`[Code Graph API] Auto-detected projectPath from registry: ${projectPath}`)
    }

    // Get agent instance for database access
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Handle initMetadata request (migration helper)
    if (initMetadata) {
      console.log(`[Code Graph API] Initializing file metadata for agent ${agentId}: ${projectPath}`)
      const count = await initializeFileMetadata(agentDb, projectPath)
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        projectPath,
        action: 'initMetadata',
        filesInitialized: count,
      })
    }

    // Delta indexing - only index changed files
    if (delta) {
      console.log(`[Code Graph API] Delta indexing project for agent ${agentId}: ${projectPath}`)

      // Check if we have file metadata (required for delta)
      const existingMetadata = await getProjectFileMetadata(agentDb, projectPath)
      if (existingMetadata.length === 0) {
        console.log(`[Code Graph API] No file metadata found, falling back to full index with metadata initialization`)
        // Do a full index first, then initialize metadata
        await clearCodeGraph(agentDb, projectPath)
        const stats = await indexProject(agentDb, projectPath, {
          includePatterns,
          excludePatterns,
          onProgress: (status) => {
            console.log(`[Code Graph API] ${status}`)
          },
        })

        // Initialize file metadata for future delta indexing
        const metadataCount = await initializeFileMetadata(agentDb, projectPath)

        return NextResponse.json({
          success: true,
          agent_id: agentId,
          projectPath,
          mode: 'full_with_metadata_init',
          stats,
          metadataFilesInitialized: metadataCount,
          message: 'First delta request - performed full index with metadata initialization. Future delta calls will be incremental.',
        })
      }

      // Perform delta indexing
      const stats = await indexProjectDelta(agentDb, projectPath, {
        includePatterns,
        excludePatterns,
        onProgress: (status) => {
          console.log(`[Code Graph API] ${status}`)
        },
      })

      return NextResponse.json({
        success: true,
        agent_id: agentId,
        projectPath,
        mode: 'delta',
        stats,
      })
    }

    // Full indexing (default behavior)
    console.log(`[Code Graph API] Full indexing project for agent ${agentId}: ${projectPath}`)

    // Clear existing graph if requested
    if (clear) {
      console.log(`[Code Graph API] Clearing existing code graph...`)
      await clearCodeGraph(agentDb, projectPath)
    }

    // Index the project
    const stats = await indexProject(agentDb, projectPath, {
      includePatterns,
      excludePatterns,
      onProgress: (status) => {
        console.log(`[Code Graph API] ${status}`)
      },
    })

    // Optionally initialize file metadata after full index for future delta support
    let metadataCount = 0
    if (clear) {
      // If we cleared, also initialize metadata so delta works next time
      metadataCount = await initializeFileMetadata(agentDb, projectPath)
    }

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      projectPath,
      mode: 'full',
      stats,
      metadataFilesInitialized: metadataCount,
    })
  } catch (error) {
    console.error('[Code Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agents/:id/graph/code
 * Clear the code graph for a project
 *
 * Query parameters:
 * - project: Project path to clear
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const projectPath = searchParams.get('project')

    if (!projectPath) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: project' },
        { status: 400 }
      )
    }

    console.log(`[Code Graph API] Clearing code graph for agent ${agentId}: ${projectPath}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await clearCodeGraph(agentDb, projectPath)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      projectPath,
      message: 'Code graph cleared',
    })
  } catch (error) {
    console.error('[Code Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
