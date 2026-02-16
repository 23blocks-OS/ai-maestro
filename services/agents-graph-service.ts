/**
 * Agents Graph Service
 *
 * Pure business logic extracted from app/api/agents/[id]/graph/** and database routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/agents/:id/database          -> getDatabaseInfo
 *   POST   /api/agents/:id/database          -> initializeDatabase
 *   GET    /api/agents/:id/graph/db           -> queryDbGraph
 *   POST   /api/agents/:id/graph/db           -> indexDbSchema
 *   DELETE /api/agents/:id/graph/db           -> clearDbGraph
 *   GET    /api/agents/:id/graph/query        -> queryGraph
 *   GET    /api/agents/:id/graph/code         -> queryCodeGraph
 *   POST   /api/agents/:id/graph/code         -> indexCodeGraph
 *   DELETE /api/agents/:id/graph/code         -> clearCodeGraph
 */

import { agentRegistry } from '@/lib/agent'
import { getAgent as getAgentFromRegistry } from '@/lib/agent-registry'
import {
  indexDatabaseSchema,
  clearDatabaseSchema,
  findTables,
  findColumnsInTable,
  findForeignKeysFromTable,
  findTableDependents,
  analyzeColumnTypeChange,
} from '@/lib/rag/db-indexer'
import { introspectDatabase } from '@/lib/rag/pg-introspector'
import {
  indexProject,
  indexProjectDelta,
  clearCodeGraph as clearCodeGraphLib,
  findFunctions,
  findCallChain,
  getFunctionDependencies,
  initializeFileMetadata,
  getProjectFileMetadata,
} from '@/lib/rag/code-indexer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Escape single quotes in strings for CozoDB queries
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}

// ===========================================================================
// PUBLIC API — Database (GET/POST /api/agents/:id/database)
// ===========================================================================

export async function getDatabaseInfo(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const metadata = await agentDb.getMetadata()
    const dbPath = agentDb.getPath()
    const exists = agentDb.exists()
    const size = agentDb.getSize()

    return {
      data: {
        success: true,
        agent_id: agentId,
        database: {
          path: dbPath,
          exists,
          size_bytes: size,
          size_human: formatBytes(size),
          metadata
        }
      },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] getDatabaseInfo Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function initializeDatabase(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Test a simple query
    const testResult = await agentDb.run(`
      ?[key, value] := *agent_metadata[key, value, _, _]
    `)

    console.log('[Graph Service] Test query result:', testResult)

    const metadata = await agentDb.getMetadata()
    const dbPath = agentDb.getPath()
    const size = agentDb.getSize()

    return {
      data: {
        success: true,
        agent_id: agentId,
        message: 'Database initialized successfully',
        database: {
          path: dbPath,
          size_bytes: size,
          size_human: formatBytes(size),
          metadata
        },
        test_result: testResult
      },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] initializeDatabase Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — DB Schema Graph (GET/POST/DELETE /api/agents/:id/graph/db)
// ===========================================================================

export async function queryDbGraph(
  agentId: string,
  params: {
    action: string
    name?: string | null
    column?: string | null
    database?: string | null
  }
): Promise<ServiceResult<any>> {
  try {
    const { action, name, column } = params

    console.log(`[Graph Service] queryDbGraph Agent: ${agentId}, Action: ${action}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (action) {
      case 'stats': {
        const dbNodes = await agentDb.run(`?[count(id)] := *db_node{id}`)
        const schemas = await agentDb.run(`?[count(id)] := *schema_node{id}`)
        const tables = await agentDb.run(`?[count(id)] := *table_node{id}`)
        const columns = await agentDb.run(`?[count(id)] := *column_node{id}`)
        const fks = await agentDb.run(`?[count(src_table)] := *fk_edge{src_table}`)
        const indexes = await agentDb.run(`?[count(id)] := *index_node{id}`)
        const views = await agentDb.run(`?[count(id)] := *view_node{id}`)
        const enums = await agentDb.run(`?[count(id)] := *enum_node{id}`)
        const procs = await agentDb.run(`?[count(id)] := *proc_node{id}`)

        result = {
          databases: dbNodes.rows[0]?.[0] || 0,
          schemas: schemas.rows[0]?.[0] || 0,
          tables: tables.rows[0]?.[0] || 0,
          columns: columns.rows[0]?.[0] || 0,
          foreign_keys: fks.rows[0]?.[0] || 0,
          indexes: indexes.rows[0]?.[0] || 0,
          views: views.rows[0]?.[0] || 0,
          enums: enums.rows[0]?.[0] || 0,
          procedures: procs.rows[0]?.[0] || 0,
        }
        break
      }

      case 'tables': {
        const namePattern = name || '%'
        result = await findTables(agentDb, namePattern)
        break
      }

      case 'columns': {
        if (!name) {
          return { error: 'columns requires "name" parameter (table name)', status: 400 }
        }
        result = await findColumnsInTable(agentDb, name)
        break
      }

      case 'fk': {
        if (!name) {
          return { error: 'fk requires "name" parameter (table name)', status: 400 }
        }
        result = await findForeignKeysFromTable(agentDb, name)
        break
      }

      case 'dependents': {
        if (!name) {
          return { error: 'dependents requires "name" parameter (table name)', status: 400 }
        }
        result = await findTableDependents(agentDb, name)
        break
      }

      case 'impact': {
        if (!name || !column) {
          return { error: 'impact requires "name" (table) and "column" parameters', status: 400 }
        }
        result = await analyzeColumnTypeChange(agentDb, name, column)
        break
      }

      case 'all': {
        const dbNodes = await agentDb.run(`?[id, name] := *db_node{id, name}`)
        const schemasData = await agentDb.run(`?[id, name, db] := *schema_node{id, name, db}`)
        const tablesData = await agentDb.run(`?[id, name, schema] := *table_node{id, name, schema}`)
        const columnsData = await agentDb.run(`?[id, name, table, data_type, nullable] := *column_node{id, name, table, data_type, nullable}`)
        const fkEdges = await agentDb.run(`?[src_table, src_col, dst_table, dst_col, on_delete, on_update] := *fk_edge{src_table, src_col, dst_table, dst_col, on_delete, on_update}`)

        result = {
          nodes: {
            databases: dbNodes.rows.map((r: any[]) => ({ id: r[0], name: r[1], type: 'database' })),
            schemas: schemasData.rows.map((r: any[]) => ({ id: r[0], name: r[1], db: r[2], type: 'schema' })),
            tables: tablesData.rows.map((r: any[]) => ({ id: r[0], name: r[1], schema: r[2], type: 'table' })),
            columns: columnsData.rows.map((r: any[]) => ({ id: r[0], name: r[1], table: r[2], data_type: r[3], nullable: r[4], type: 'column' })),
          },
          edges: {
            foreign_keys: fkEdges.rows.map((r: any[]) => ({
              source: r[0],
              source_col: r[1],
              target: r[2],
              target_col: r[3],
              on_delete: r[4],
              on_update: r[5],
              type: 'fk',
            })),
          },
        }
        break
      }

      default:
        return { error: `Unknown action: ${action}`, status: 400 }
    }

    return {
      data: { success: true, agent_id: agentId, action, result },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] queryDbGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function indexDbSchema(
  agentId: string,
  body: { connectionString: string; clear?: boolean }
): Promise<ServiceResult<any>> {
  try {
    const { connectionString, clear = true } = body

    if (!connectionString) {
      return { error: 'Missing required parameter: connectionString', status: 400 }
    }

    console.log(`[Graph Service] Indexing database schema for agent ${agentId}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    console.log(`[Graph Service] Introspecting database...`)
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString })
    const dbSchema = await introspectDatabase(pool)

    if (clear) {
      console.log(`[Graph Service] Clearing existing database schema graph...`)
      await clearDatabaseSchema(agentDb, dbSchema.database)
    }

    const stats = await indexDatabaseSchema(agentDb, dbSchema)

    return {
      data: { success: true, agent_id: agentId, database: dbSchema.database, stats },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] indexDbSchema Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function clearDbGraph(
  agentId: string,
  databaseName: string
): Promise<ServiceResult<any>> {
  try {
    if (!databaseName) {
      return { error: 'Missing required parameter: database', status: 400 }
    }

    console.log(`[Graph Service] Clearing database schema graph for agent ${agentId}: ${databaseName}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await clearDatabaseSchema(agentDb, databaseName)

    return {
      data: { success: true, agent_id: agentId, database: databaseName, message: 'Database schema graph cleared' },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] clearDbGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Graph Query (GET /api/agents/:id/graph/query)
// ===========================================================================

export async function queryGraph(
  agentId: string,
  params: {
    queryType: string | null
    name?: string | null
    type?: string | null
    from?: string | null
    to?: string | null
  }
): Promise<ServiceResult<any>> {
  try {
    const { queryType, name, type, from, to } = params

    console.log(`[Graph Service] queryGraph Agent: ${agentId}, Query: ${queryType}, Name: ${name}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (queryType) {
      case 'find-callers': {
        if (!name) {
          return { error: 'find-callers requires "name" parameter', status: 400 }
        }

        const callersResult = await agentDb.run(`
          ?[caller_name, caller_file] :=
            *functions{fn_id: callee, name: callee_name},
            callee_name = '${escapeString(name)}',
            *calls{caller_fn: caller, callee_fn: callee},
            *functions{fn_id: caller, name: caller_name, file_id: caller_file_id},
            *files{file_id: caller_file_id, path: caller_file}
        `)

        result = {
          function: name,
          callers: callersResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] })),
          count: callersResult.rows.length,
        }
        break
      }

      case 'find-callees': {
        if (!name) {
          return { error: 'find-callees requires "name" parameter', status: 400 }
        }

        const calleesResult = await agentDb.run(`
          ?[callee_name, callee_file] :=
            *functions{fn_id: caller, name: caller_name},
            caller_name = '${escapeString(name)}',
            *calls{caller_fn: caller, callee_fn: callee},
            *functions{fn_id: callee, name: callee_name, file_id: callee_file_id},
            *files{file_id: callee_file_id, path: callee_file}
        `)

        result = {
          function: name,
          callees: calleesResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] })),
          count: calleesResult.rows.length,
        }
        break
      }

      case 'find-related': {
        if (!name) {
          return { error: 'find-related requires "name" parameter', status: 400 }
        }

        const related: any = {
          component: name,
          extends_from: [],
          extended_by: [],
          includes: [],
          included_by: [],
          associations: [],
          associated_by: [],
          serializes: null,
          serialized_by: [],
        }

        try {
          const extendsResult = await agentDb.run(`
            ?[parent_name] :=
              *components{component_id: child, name: child_name},
              child_name = '${escapeString(name)}',
              *extends{child_class: child, parent_class: parent},
              *components{component_id: parent, name: parent_name}
          `)
          related.extends_from = extendsResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        try {
          const extendedByResult = await agentDb.run(`
            ?[child_name] :=
              *components{component_id: parent, name: parent_name},
              parent_name = '${escapeString(name)}',
              *extends{child_class: child, parent_class: parent},
              *components{component_id: child, name: child_name}
          `)
          related.extended_by = extendedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        try {
          const includesResult = await agentDb.run(`
            ?[module_name] :=
              *components{component_id: class_id, name: class_name},
              class_name = '${escapeString(name)}',
              *includes{class_id, module_name}
          `)
          related.includes = includesResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        try {
          const includedByResult = await agentDb.run(`
            ?[class_name] :=
              *components{component_id: module_id, name: module_name},
              module_name = '${escapeString(name)}',
              *includes{class_id, module_name: module_id_str},
              module_id_str = module_id,
              *components{component_id: class_id, name: class_name}
          `)
          related.included_by = includedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        try {
          const associationsResult = await agentDb.run(`
            ?[to_class_name, assoc_type] :=
              *components{component_id: from_id, name: from_name},
              from_name = '${escapeString(name)}',
              *associations{from_class: from_id, to_class, assoc_type},
              *components{component_id: to_class, name: to_class_name}
          `)
          related.associations = associationsResult.rows.map((r: any[]) => ({
            target: r[0],
            type: r[1],
          }))
        } catch { /* table may not exist */ }

        try {
          const associatedByResult = await agentDb.run(`
            ?[from_class_name, assoc_type] :=
              *components{component_id: to_id, name: to_name},
              to_name = '${escapeString(name)}',
              *associations{from_class, to_class: to_id, assoc_type},
              *components{component_id: from_class, name: from_class_name}
          `)
          related.associated_by = associatedByResult.rows.map((r: any[]) => ({
            source: r[0],
            type: r[1],
          }))
        } catch { /* table may not exist */ }

        try {
          const serializesResult = await agentDb.run(`
            ?[model_name] :=
              *components{component_id: serializer_id, name: serializer_name},
              serializer_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: model_id, name: model_name}
          `)
          if (serializesResult.rows.length > 0) {
            related.serializes = serializesResult.rows[0][0]
          }
        } catch { /* table may not exist */ }

        try {
          const serializedByResult = await agentDb.run(`
            ?[serializer_name] :=
              *components{component_id: model_id, name: model_name},
              model_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: serializer_id, name: serializer_name}
          `)
          related.serialized_by = serializedByResult.rows.map((r: any[]) => r[0])
        } catch { /* table may not exist */ }

        result = related
        break
      }

      case 'find-by-type': {
        if (!type) {
          return { error: 'find-by-type requires "type" parameter', status: 400 }
        }

        try {
          const componentsResult = await agentDb.run(`
            ?[name, file_path] :=
              *components{component_id, name, file_id, class_type},
              class_type = '${escapeString(type)}',
              *files{file_id, path: file_path}
          `)

          result = {
            type,
            components: componentsResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] })),
            count: componentsResult.rows.length,
          }
        } catch {
          result = {
            type,
            components: [],
            count: 0,
            error: 'class_type not available in this database',
          }
        }
        break
      }

      case 'find-associations': {
        if (!name) {
          return { error: 'find-associations requires "name" parameter', status: 400 }
        }

        try {
          const outgoingResult = await agentDb.run(`
            ?[to_class_name, assoc_type] :=
              *components{component_id: from_id, name: from_name},
              from_name = '${escapeString(name)}',
              *associations{from_class: from_id, to_class, assoc_type},
              *components{component_id: to_class, name: to_class_name}
          `)

          const incomingResult = await agentDb.run(`
            ?[from_class_name, assoc_type] :=
              *components{component_id: to_id, name: to_name},
              to_name = '${escapeString(name)}',
              *associations{from_class, to_class: to_id, assoc_type},
              *components{component_id: from_class, name: from_class_name}
          `)

          result = {
            model: name,
            outgoing: outgoingResult.rows.map((r: any[]) => ({ target: r[0], type: r[1] })),
            incoming: incomingResult.rows.map((r: any[]) => ({ source: r[0], type: r[1] })),
          }
        } catch {
          result = {
            model: name,
            outgoing: [],
            incoming: [],
            error: 'associations table not available',
          }
        }
        break
      }

      case 'find-serializers': {
        if (!name) {
          return { error: 'find-serializers requires "name" parameter', status: 400 }
        }

        try {
          const serializersResult = await agentDb.run(`
            ?[serializer_name, file_path] :=
              *components{component_id: model_id, name: model_name},
              model_name = '${escapeString(name)}',
              *serializes{serializer_id, model_id},
              *components{component_id: serializer_id, name: serializer_name, file_id},
              *files{file_id, path: file_path}
          `)

          result = {
            model: name,
            serializers: serializersResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] })),
            count: serializersResult.rows.length,
          }
        } catch {
          result = {
            model: name,
            serializers: [],
            count: 0,
            error: 'serializes table not available',
          }
        }
        break
      }

      case 'find-path': {
        if (!from || !to) {
          return { error: 'find-path requires "from" and "to" parameters', status: 400 }
        }

        try {
          const pathResult = await agentDb.run(`
            path[start, end, depth, via] :=
              *functions{fn_id: start, name: start_name},
              start_name = '${escapeString(from)}',
              *calls{caller_fn: start, callee_fn: end},
              depth = 1,
              via = [start_name]

            path[start, end, depth, via] :=
              path[start, mid, d1, via1],
              *calls{caller_fn: mid, callee_fn: end},
              depth = d1 + 1,
              depth <= 5,
              *functions{fn_id: mid, name: mid_name},
              via = append(via1, mid_name)

            ?[depth, via] :=
              path[start, end, depth, via],
              *functions{fn_id: end, name: end_name},
              end_name = '${escapeString(to)}'

            :order depth
            :limit 5
          `)

          result = {
            from,
            to,
            paths: pathResult.rows.map((r: any[]) => ({ depth: r[0], via: r[1] })),
            found: pathResult.rows.length > 0,
          }
        } catch (error) {
          result = {
            from,
            to,
            paths: [],
            found: false,
            error: error instanceof Error ? error.message : 'Path query failed',
          }
        }
        break
      }

      case 'describe': {
        if (!name) {
          return { error: 'describe requires "name" parameter', status: 400 }
        }

        const description: any = { name, found: false }

        // Try to find as component (class)
        try {
          const componentResult = await agentDb.run(`
            ?[component_id, name, file_path, class_type] :=
              *components{component_id, name, file_id, class_type},
              name = '${escapeString(name)}',
              *files{file_id, path: file_path}
          `)

          if (componentResult.rows.length > 0) {
            const r = componentResult.rows[0]
            description.found = true
            description.type = 'component'
            description.class_type = r[3]
            description.file = r[2]

            const related: any = {
              extends_from: [],
              extended_by: [],
              includes: [],
              associations: [],
              serialized_by: [],
            }

            try {
              const extendsResult = await agentDb.run(`
                ?[parent_name] :=
                  *components{component_id: child, name: child_name},
                  child_name = '${escapeString(name)}',
                  *extends{child_class: child, parent_class: parent},
                  *components{component_id: parent, name: parent_name}
              `)
              related.extends_from = extendsResult.rows.map((row: any[]) => row[0])
            } catch { /* ignore */ }

            try {
              const extendedByResult = await agentDb.run(`
                ?[child_name] :=
                  *components{component_id: parent, name: parent_name},
                  parent_name = '${escapeString(name)}',
                  *extends{child_class: child, parent_class: parent},
                  *components{component_id: child, name: child_name}
              `)
              related.extended_by = extendedByResult.rows.map((row: any[]) => row[0])
            } catch { /* ignore */ }

            try {
              const includesResult = await agentDb.run(`
                ?[module_name] :=
                  *components{component_id: class_id, name: class_name},
                  class_name = '${escapeString(name)}',
                  *includes{class_id, module_name}
              `)
              related.includes = includesResult.rows.map((row: any[]) => row[0])
            } catch { /* ignore */ }

            try {
              const associationsResult = await agentDb.run(`
                ?[to_class_name, assoc_type] :=
                  *components{component_id: from_id, name: from_name},
                  from_name = '${escapeString(name)}',
                  *associations{from_class: from_id, to_class, assoc_type},
                  *components{component_id: to_class, name: to_class_name}
              `)
              related.associations = associationsResult.rows.map((row: any[]) => ({
                target: row[0],
                type: row[1],
              }))
            } catch { /* ignore */ }

            try {
              const serializedByResult = await agentDb.run(`
                ?[serializer_name] :=
                  *components{component_id: model_id, name: model_name},
                  model_name = '${escapeString(name)}',
                  *serializes{serializer_id, model_id},
                  *components{component_id: serializer_id, name: serializer_name}
              `)
              related.serialized_by = serializedByResult.rows.map((row: any[]) => row[0])
            } catch { /* ignore */ }

            description.relationships = related
          }
        } catch { /* ignore */ }

        // Try to find as function
        if (!description.found) {
          try {
            const functionResult = await agentDb.run(`
              ?[fn_id, name, file_path, is_export] :=
                *functions{fn_id, name, file_id, is_export},
                name = '${escapeString(name)}',
                *files{file_id, path: file_path}
            `)

            if (functionResult.rows.length > 0) {
              const r = functionResult.rows[0]
              description.found = true
              description.type = 'function'
              description.file = r[2]
              description.is_export = r[3]

              const callersResult = await agentDb.run(`
                ?[caller_name] :=
                  *functions{fn_id: callee, name: callee_name},
                  callee_name = '${escapeString(name)}',
                  *calls{caller_fn: caller, callee_fn: callee},
                  *functions{fn_id: caller, name: caller_name}
              `)

              const calleesResult = await agentDb.run(`
                ?[callee_name] :=
                  *functions{fn_id: caller, name: caller_name},
                  caller_name = '${escapeString(name)}',
                  *calls{caller_fn: caller, callee_fn: callee},
                  *functions{fn_id: callee, name: callee_name}
              `)

              description.callers = callersResult.rows.map((r: any[]) => r[0])
              description.callees = calleesResult.rows.map((r: any[]) => r[0])
            }
          } catch { /* ignore */ }
        }

        result = description
        break
      }

      default:
        return {
          error: `Unknown query type: ${queryType}`,
          data: {
            available_queries: [
              'find-callers', 'find-callees', 'find-related', 'find-by-type',
              'find-associations', 'find-serializers', 'find-path', 'describe',
            ],
          },
          status: 400
        }
    }

    return {
      data: { success: true, agent_id: agentId, query: queryType, result },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] queryGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Code Graph (GET/POST/DELETE /api/agents/:id/graph/code)
// ===========================================================================

export async function queryCodeGraph(
  agentId: string,
  params: {
    action: string
    name?: string | null
    from?: string | null
    to?: string | null
    project?: string | null
    nodeId?: string | null
    depth?: number
  }
): Promise<ServiceResult<any>> {
  try {
    const { action, name, from, to, project: projectFilter, nodeId, depth = 1 } = params

    console.log(`[Graph Service] queryCodeGraph Agent: ${agentId}, Action: ${action}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (action) {
      case 'stats': {
        const filesResult = await agentDb.run(`?[count(file_id)] := *files{file_id}`)
        const functionsResult = await agentDb.run(`?[count(fn_id)] := *functions{fn_id}`)
        const componentsResult = await agentDb.run(`?[count(component_id)] := *components{component_id}`)
        const importsResult = await agentDb.run(`?[count(from_file)] := *imports{from_file}`)
        const callsResult = await agentDb.run(`?[count(caller_fn)] := *calls{caller_fn}`)

        let classTypeBreakdown: Record<string, number> = {}
        try {
          const classTypesResult = await agentDb.run(`
            ?[class_type, count(component_id)] := *components{component_id, class_type}, class_type != null
          `)
          for (const row of classTypesResult.rows) {
            classTypeBreakdown[row[0] as string] = row[1] as number
          }
        } catch { /* class_type column may not exist in older schemas */ }

        let extendsCount = 0, includesCount = 0, associationsCount = 0, serializesCount = 0
        try {
          const extendsResult = await agentDb.run(`?[count(child_class)] := *extends{child_class}`)
          extendsCount = extendsResult.rows[0]?.[0] || 0
        } catch { /* table may not exist */ }
        try {
          const includesResultDb = await agentDb.run(`?[count(class_id)] := *includes{class_id}`)
          includesCount = includesResultDb.rows[0]?.[0] || 0
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
          classTypes: classTypeBreakdown,
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
        const namePattern = name || '%'
        result = await findFunctions(agentDb, namePattern)
        break
      }

      case 'call-chain': {
        if (!from || !to) {
          return { error: 'call-chain requires "from" and "to" parameters', status: 400 }
        }
        result = await findCallChain(agentDb, from, to)
        break
      }

      case 'dependencies': {
        if (!name) {
          return { error: 'dependencies requires "name" parameter', status: 400 }
        }
        result = await getFunctionDependencies(agentDb, name)
        break
      }

      case 'files': {
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
        const files = await agentDb.run(`?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}`)
        const functions = await agentDb.run(`?[fn_id, name, file_id, is_export, lang] := *functions{fn_id, name, file_id, is_export, lang}`)
        let components: any
        try {
          components = await agentDb.run(`?[component_id, name, file_id, class_type] := *components{component_id, name, file_id, class_type}`)
        } catch {
          components = await agentDb.run(`?[component_id, name, file_id] := *components{component_id, name, file_id}`)
        }
        const imports = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}`)
        const calls = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}`)

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
              id: r[0], name: r[1], file_id: r[2], class_type: r[3] || 'class', type: 'component'
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
        if (!nodeId) {
          return { error: 'focus requires "nodeId" parameter', status: 400 }
        }

        console.log(`[Graph Service] Focus on node: ${nodeId}, depth: ${depth}`)

        const relatedNodeIds = new Set<string>([nodeId])
        const edges: any[] = []

        const addEdge = (source: string, target: string, edgeType: string, extra?: any) => {
          relatedNodeIds.add(source)
          relatedNodeIds.add(target)
          edges.push({ source, target, type: edgeType, ...extra })
        }

        const escapedNodeId = nodeId.replace(/'/g, "''")

        // Function calls
        try {
          const callsOut = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, caller_fn = '${escapedNodeId}'`)
          const callsIn = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, callee_fn = '${escapedNodeId}'`)
          for (const r of [...callsOut.rows, ...callsIn.rows]) { addEdge(r[0], r[1], 'calls') }
        } catch { /* table may not exist */ }

        // Imports
        try {
          const importsOut = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}, from_file = '${escapedNodeId}'`)
          const importsIn = await agentDb.run(`?[from_file, to_file] := *imports{from_file, to_file}, to_file = '${escapedNodeId}'`)
          for (const r of [...importsOut.rows, ...importsIn.rows]) { addEdge(r[0], r[1], 'imports') }
        } catch { /* table may not exist */ }

        // Extends
        try {
          const extendsOut = await agentDb.run(`?[child_class, parent_class] := *extends{child_class, parent_class}, child_class = '${escapedNodeId}'`)
          const extendsIn = await agentDb.run(`?[child_class, parent_class] := *extends{child_class, parent_class}, parent_class = '${escapedNodeId}'`)
          for (const r of [...extendsOut.rows, ...extendsIn.rows]) { addEdge(r[0], r[1], 'extends') }
        } catch { /* table may not exist */ }

        // Includes
        try {
          const includesOut = await agentDb.run(`?[class_id, module_name] := *includes{class_id, module_name}, class_id = '${escapedNodeId}'`)
          const includesIn = await agentDb.run(`?[class_id, module_name] := *includes{class_id, module_name}, module_name = '${escapedNodeId}'`)
          for (const r of [...includesOut.rows, ...includesIn.rows]) { addEdge(r[0], r[1], 'includes') }
        } catch { /* table may not exist */ }

        // Associations
        try {
          const assocsOut = await agentDb.run(`?[from_class, to_class, assoc_type] := *associations{from_class, to_class, assoc_type}, from_class = '${escapedNodeId}'`)
          const assocsIn = await agentDb.run(`?[from_class, to_class, assoc_type] := *associations{from_class, to_class, assoc_type}, to_class = '${escapedNodeId}'`)
          for (const r of [...assocsOut.rows, ...assocsIn.rows]) { addEdge(r[0], r[1], 'association', { assoc_type: r[2] }) }
        } catch { /* table may not exist */ }

        // Serializes
        try {
          const serializesOut = await agentDb.run(`?[serializer_id, model_id] := *serializes{serializer_id, model_id}, serializer_id = '${escapedNodeId}'`)
          const serializesIn = await agentDb.run(`?[serializer_id, model_id] := *serializes{serializer_id, model_id}, model_id = '${escapedNodeId}'`)
          for (const r of [...serializesOut.rows, ...serializesIn.rows]) { addEdge(r[0], r[1], 'serializes') }
        } catch { /* table may not exist */ }

        // Declares
        try {
          const declaresOut = await agentDb.run(`?[file_id, fn_id] := *declares{file_id, fn_id}, file_id = '${escapedNodeId}'`)
          const declaresIn = await agentDb.run(`?[file_id, fn_id] := *declares{file_id, fn_id}, fn_id = '${escapedNodeId}'`)
          for (const r of [...declaresOut.rows, ...declaresIn.rows]) { addEdge(r[0], r[1], 'declares') }
        } catch { /* table may not exist */ }

        // Fetch node data for all related nodes
        const nodeIdsArray = Array.from(relatedNodeIds)
        const nodes: any[] = []

        for (const id of nodeIdsArray) {
          const escapedId = id.replace(/'/g, "''")
          try {
            const fileResult = await agentDb.run(`?[file_id, path, module, project_path] := *files{file_id, path, module, project_path}, file_id = '${escapedId}'`)
            if (fileResult.rows.length > 0) {
              const r = fileResult.rows[0]
              nodes.push({ id: r[0], path: r[1], module: r[2], project: r[3], type: 'file' })
            }
          } catch { /* ignore */ }
        }

        for (const id of nodeIdsArray) {
          const escapedId = id.replace(/'/g, "''")
          try {
            const fnResult = await agentDb.run(`?[fn_id, name, file_id, is_export, lang] := *functions{fn_id, name, file_id, is_export, lang}, fn_id = '${escapedId}'`)
            if (fnResult.rows.length > 0) {
              const r = fnResult.rows[0]
              nodes.push({ id: r[0], name: r[1], file_id: r[2], is_export: r[3], lang: r[4], type: 'function' })
            }
          } catch { /* ignore */ }
        }

        for (const id of nodeIdsArray) {
          const escapedId = id.replace(/'/g, "''")
          try {
            let compResult: any
            try {
              compResult = await agentDb.run(`?[component_id, name, file_id, class_type] := *components{component_id, name, file_id, class_type}, component_id = '${escapedId}'`)
            } catch {
              compResult = await agentDb.run(`?[component_id, name, file_id] := *components{component_id, name, file_id}, component_id = '${escapedId}'`)
            }
            if (compResult.rows.length > 0) {
              const r = compResult.rows[0]
              nodes.push({ id: r[0], name: r[1], file_id: r[2], class_type: r[3] || 'class', type: 'component' })
            }
          } catch { /* ignore */ }
        }

        result = { focusNodeId: nodeId, depth, nodes, edges }
        break
      }

      default:
        return { error: `Unknown action: ${action}`, status: 400 }
    }

    return {
      data: { success: true, agent_id: agentId, action, result },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] queryCodeGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function indexCodeGraph(
  agentId: string,
  body: {
    projectPath?: string
    delta?: boolean
    clear?: boolean
    initMetadata?: boolean
    includePatterns?: string[]
    excludePatterns?: string[]
  }
): Promise<ServiceResult<any>> {
  try {
    let { projectPath, delta = false, clear = true, initMetadata = false, includePatterns, excludePatterns } = body

    // Auto-detect projectPath from agent registry if not provided
    if (!projectPath) {
      const registryAgent = getAgentFromRegistry(agentId)
      if (!registryAgent) {
        return { error: `Agent not found in registry: ${agentId}`, status: 404 }
      }

      projectPath = registryAgent.workingDirectory ||
                    registryAgent.sessions?.[0]?.workingDirectory ||
                    registryAgent.preferences?.defaultWorkingDirectory

      if (!projectPath) {
        return { error: 'No projectPath provided and agent has no configured working directory', status: 400 }
      }

      console.log(`[Graph Service] Auto-detected projectPath from registry: ${projectPath}`)
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Handle initMetadata request (migration helper)
    if (initMetadata) {
      console.log(`[Graph Service] Initializing file metadata for agent ${agentId}: ${projectPath}`)
      const count = await initializeFileMetadata(agentDb, projectPath)
      return {
        data: {
          success: true, agent_id: agentId, projectPath,
          action: 'initMetadata', filesInitialized: count,
        },
        status: 200
      }
    }

    // Delta indexing
    if (delta) {
      console.log(`[Graph Service] Delta indexing project for agent ${agentId}: ${projectPath}`)

      const existingMetadata = await getProjectFileMetadata(agentDb, projectPath)
      if (existingMetadata.length === 0) {
        console.log(`[Graph Service] No file metadata found, falling back to full index with metadata initialization`)
        await clearCodeGraphLib(agentDb, projectPath)
        const stats = await indexProject(agentDb, projectPath, {
          includePatterns,
          excludePatterns,
          onProgress: (status) => { console.log(`[Graph Service] ${status}`) },
        })

        const metadataCount = await initializeFileMetadata(agentDb, projectPath)

        return {
          data: {
            success: true, agent_id: agentId, projectPath,
            mode: 'full_with_metadata_init', stats,
            metadataFilesInitialized: metadataCount,
            message: 'First delta request - performed full index with metadata initialization. Future delta calls will be incremental.',
          },
          status: 200
        }
      }

      const stats = await indexProjectDelta(agentDb, projectPath, {
        includePatterns,
        excludePatterns,
        onProgress: (status) => { console.log(`[Graph Service] ${status}`) },
      })

      return {
        data: { success: true, agent_id: agentId, projectPath, mode: 'delta', stats },
        status: 200
      }
    }

    // Full indexing (default)
    console.log(`[Graph Service] Full indexing project for agent ${agentId}: ${projectPath}`)

    if (clear) {
      console.log(`[Graph Service] Clearing existing code graph...`)
      await clearCodeGraphLib(agentDb, projectPath)
    }

    const stats = await indexProject(agentDb, projectPath, {
      includePatterns,
      excludePatterns,
      onProgress: (status) => { console.log(`[Graph Service] ${status}`) },
    })

    let metadataCount = 0
    if (clear) {
      metadataCount = await initializeFileMetadata(agentDb, projectPath)
    }

    return {
      data: {
        success: true, agent_id: agentId, projectPath,
        mode: 'full', stats, metadataFilesInitialized: metadataCount,
      },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] indexCodeGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function deleteCodeGraph(
  agentId: string,
  projectPath: string
): Promise<ServiceResult<any>> {
  try {
    if (!projectPath) {
      return { error: 'Missing required parameter: project', status: 400 }
    }

    console.log(`[Graph Service] Clearing code graph for agent ${agentId}: ${projectPath}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await clearCodeGraphLib(agentDb, projectPath)

    return {
      data: { success: true, agent_id: agentId, projectPath, message: 'Code graph cleared' },
      status: 200
    }
  } catch (error) {
    console.error('[Graph Service] deleteCodeGraph Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}
