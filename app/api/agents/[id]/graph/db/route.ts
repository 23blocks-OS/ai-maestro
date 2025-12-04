import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
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

/**
 * GET /api/agents/:id/graph/db
 * Query the database schema graph for an agent
 *
 * Query parameters:
 * - action: Query action (stats | tables | columns | fk | dependents | impact | all)
 * - name: Table name pattern (for tables, columns, fk, dependents)
 * - column: Column name (for impact analysis)
 * - database: Database name filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const action = searchParams.get('action') || 'stats'

    console.log(`[DB Graph API] Agent: ${agentId}, Action: ${action}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let result: any = {}

    switch (action) {
      case 'stats': {
        // Get counts for all DB graph tables
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
        const namePattern = searchParams.get('name') || '%'
        result = await findTables(agentDb, namePattern)
        break
      }

      case 'columns': {
        const tableName = searchParams.get('name')
        if (!tableName) {
          return NextResponse.json(
            { success: false, error: 'columns requires "name" parameter (table name)' },
            { status: 400 }
          )
        }
        result = await findColumnsInTable(agentDb, tableName)
        break
      }

      case 'fk': {
        const tableName = searchParams.get('name')
        if (!tableName) {
          return NextResponse.json(
            { success: false, error: 'fk requires "name" parameter (table name)' },
            { status: 400 }
          )
        }
        result = await findForeignKeysFromTable(agentDb, tableName)
        break
      }

      case 'dependents': {
        const tableName = searchParams.get('name')
        if (!tableName) {
          return NextResponse.json(
            { success: false, error: 'dependents requires "name" parameter (table name)' },
            { status: 400 }
          )
        }
        result = await findTableDependents(agentDb, tableName)
        break
      }

      case 'impact': {
        const tableName = searchParams.get('name')
        const columnName = searchParams.get('column')
        if (!tableName || !columnName) {
          return NextResponse.json(
            { success: false, error: 'impact requires "name" (table) and "column" parameters' },
            { status: 400 }
          )
        }
        result = await analyzeColumnTypeChange(agentDb, tableName, columnName)
        break
      }

      case 'all': {
        // Return full graph data for visualization
        const dbNodes = await agentDb.run(`?[id, name] := *db_node{id, name}`)
        const schemas = await agentDb.run(`?[id, name, db] := *schema_node{id, name, db}`)
        const tables = await agentDb.run(`?[id, name, schema] := *table_node{id, name, schema}`)
        const columns = await agentDb.run(`?[id, name, table, data_type, nullable] := *column_node{id, name, table, data_type, nullable}`)
        const fkEdges = await agentDb.run(`?[src_table, src_col, dst_table, dst_col, on_delete, on_update] := *fk_edge{src_table, src_col, dst_table, dst_col, on_delete, on_update}`)

        result = {
          nodes: {
            databases: dbNodes.rows.map((r: any[]) => ({ id: r[0], name: r[1], type: 'database' })),
            schemas: schemas.rows.map((r: any[]) => ({ id: r[0], name: r[1], db: r[2], type: 'schema' })),
            tables: tables.rows.map((r: any[]) => ({ id: r[0], name: r[1], schema: r[2], type: 'table' })),
            columns: columns.rows.map((r: any[]) => ({ id: r[0], name: r[1], table: r[2], data_type: r[3], nullable: r[4], type: 'column' })),
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
    console.error('[DB Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents/:id/graph/db
 * Index a PostgreSQL database schema into the graph
 *
 * Body:
 * - connectionString: PostgreSQL connection string
 * - clear: Whether to clear existing data first (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()

    const { connectionString, clear = true } = body

    if (!connectionString) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: connectionString' },
        { status: 400 }
      )
    }

    console.log(`[DB Graph API] Indexing database schema for agent ${agentId}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Introspect the database
    console.log(`[DB Graph API] Introspecting database...`)
    const dbSchema = await introspectDatabase(connectionString)

    // Clear existing graph if requested
    if (clear) {
      console.log(`[DB Graph API] Clearing existing database schema graph...`)
      await clearDatabaseSchema(agentDb, dbSchema.database)
    }

    // Index the schema
    const stats = await indexDatabaseSchema(agentDb, dbSchema)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      database: dbSchema.database,
      stats,
    })
  } catch (error) {
    console.error('[DB Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agents/:id/graph/db
 * Clear the database schema graph
 *
 * Query parameters:
 * - database: Database name to clear
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const databaseName = searchParams.get('database')

    if (!databaseName) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: database' },
        { status: 400 }
      )
    }

    console.log(`[DB Graph API] Clearing database schema graph for agent ${agentId}: ${databaseName}`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await clearDatabaseSchema(agentDb, databaseName)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      database: databaseName,
      message: 'Database schema graph cleared',
    })
  } catch (error) {
    console.error('[DB Graph API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
