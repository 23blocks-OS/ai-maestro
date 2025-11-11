/**
 * Database Schema Graph Indexer
 * Stores introspected PostgreSQL schema into CozoDB
 */

import { AgentDatabase } from '@/lib/cozo-db'
import { DbSchema, TableInfo, ColumnInfo, ForeignKeyInfo } from './pg-introspector'

export interface DbIndexStats {
  schemasIndexed: number
  tablesIndexed: number
  columnsIndexed: number
  indexesIndexed: number
  constraintsIndexed: number
  foreignKeysIndexed: number
  viewsIndexed: number
  enumsIndexed: number
  proceduresIndexed: number
  durationMs: number
}

/**
 * Index database schema into CozoDB
 */
export async function indexDatabaseSchema(
  agentDb: AgentDatabase,
  dbSchema: DbSchema
): Promise<DbIndexStats> {
  const startTime = Date.now()
  const stats: DbIndexStats = {
    schemasIndexed: 0,
    tablesIndexed: 0,
    columnsIndexed: 0,
    indexesIndexed: 0,
    constraintsIndexed: 0,
    foreignKeysIndexed: 0,
    viewsIndexed: 0,
    enumsIndexed: 0,
    proceduresIndexed: 0,
    durationMs: 0,
  }

  console.log(`[DB Indexer] Indexing database: ${dbSchema.database}`)

  // Index database node
  await agentDb.run(`
    ?[id, name] <- [['db:${dbSchema.database}', '${dbSchema.database}']]
    :put db_node {id, name}
  `)

  // Index each schema
  for (const schema of dbSchema.schemas) {
    console.log(`[DB Indexer] Indexing schema: ${schema.schema_name}`)

    // Insert schema node
    await agentDb.run(`
      ?[id, name, db] <- [[
        '${schema.schema_id}',
        '${escapeString(schema.schema_name)}',
        'db:${dbSchema.database}'
      ]]
      :put schema_node {id, name, db}
    `)
    stats.schemasIndexed++

    // Index tables
    for (const table of schema.tables) {
      await indexTable(agentDb, table, stats)
    }

    // Index views
    for (const view of schema.views) {
      await agentDb.run(`
        ?[id, name, schema, definition] <- [[
          '${view.view_id}',
          '${escapeString(view.view_name)}',
          '${schema.schema_id}',
          '${escapeString(view.definition)}'
        ]]
        :put view_node {id, name, schema, definition}
      `)
      stats.viewsIndexed++
    }

    // Index enums
    for (const enumType of schema.enums) {
      await agentDb.run(`
        ?[id, name, schema] <- [[
          '${enumType.enum_id}',
          '${escapeString(enumType.enum_name)}',
          '${schema.schema_id}'
        ]]
        :put enum_node {id, name, schema}
      `)

      // Index enum values
      for (const value of enumType.values) {
        const valueId = `${enumType.enum_id}:${value}`
        await agentDb.run(`
          ?[id, enum_id, value] <- [[
            '${valueId}',
            '${enumType.enum_id}',
            '${escapeString(value)}'
          ]]
          :put enum_value {id, enum_id, value}
        `)
      }

      stats.enumsIndexed++
    }

    // Index procedures
    for (const proc of schema.procedures) {
      await agentDb.run(`
        ?[id, name, schema, kind, lang] <- [[
          '${proc.proc_id}',
          '${escapeString(proc.proc_name)}',
          '${schema.schema_id}',
          '${proc.kind}',
          '${proc.language}'
        ]]
        :put proc_node {id, name, schema, kind, lang}
      `)
      stats.proceduresIndexed++
    }
  }

  stats.durationMs = Date.now() - startTime

  console.log(`[DB Indexer] ✅ Indexing complete in ${stats.durationMs}ms`)
  console.log(`[DB Indexer] Stats:`, stats)

  return stats
}

/**
 * Index a single table
 */
async function indexTable(
  agentDb: AgentDatabase,
  table: TableInfo,
  stats: DbIndexStats
): Promise<void> {
  const schemaId = `schema:${table.schema_name}`

  // Insert table node
  await agentDb.run(`
    ?[id, name, schema] <- [[
      '${table.table_id}',
      '${escapeString(table.table_name)}',
      '${schemaId}'
    ]]
    :put table_node {id, name, schema}
  `)
  stats.tablesIndexed++

  // Index columns
  for (const column of table.columns) {
    await agentDb.run(`
      ?[id, name, table, data_type, udt, nullable, default_val] <- [[
        '${column.column_id}',
        '${escapeString(column.column_name)}',
        '${column.table_id}',
        '${escapeString(column.data_type)}',
        '${escapeString(column.udt_name)}',
        ${column.is_nullable},
        ${column.column_default ? `'${escapeString(column.column_default)}'` : 'null'}
      ]]
      :put column_node {id, name, table, data_type, udt, nullable, default: default_val}
    `)
    stats.columnsIndexed++
  }

  // Index indexes
  for (const index of table.indexes) {
    await agentDb.run(`
      ?[id, name, table, is_unique, method] <- [[
        '${index.index_id}',
        '${escapeString(index.index_name)}',
        '${index.table_id}',
        ${index.is_unique},
        '${index.index_type}'
      ]]
      :put index_node {id, name, table, is_unique, method}
    `)

    // Index index_on edges
    for (const columnName of index.columns) {
      const columnId = `col:${table.table_id}.${columnName}`
      await agentDb.run(`
        ?[index, column] <- [['${index.index_id}', '${columnId}']]
        :put index_on {index, column}
      `)
    }

    stats.indexesIndexed++
  }

  // Index constraints
  for (const constraint of table.constraints) {
    await agentDb.run(`
      ?[id, name, table, kind] <- [[
        '${constraint.constraint_id}',
        '${escapeString(constraint.constraint_name)}',
        '${constraint.table_id}',
        '${constraint.constraint_type}'
      ]]
      :put constraint_node {id, name, table, kind}
    `)
    stats.constraintsIndexed++
  }

  // Index foreign keys
  for (const fk of table.foreign_keys) {
    await agentDb.run(`
      ?[src_table, src_col, dst_table, dst_col, on_delete, on_update] <- [[
        '${fk.from_table}',
        '${escapeString(fk.from_column)}',
        '${fk.to_table}',
        '${escapeString(fk.to_column)}',
        '${fk.on_delete}',
        '${fk.on_update}'
      ]]
      :put fk_edge {src_table, src_col, dst_table, dst_col, on_delete, on_update}
    `)
    stats.foreignKeysIndexed++
  }
}

/**
 * Clear database schema graph
 */
export async function clearDatabaseSchema(
  agentDb: AgentDatabase,
  databaseName: string
): Promise<void> {
  console.log(`[DB Indexer] Clearing database schema: ${databaseName}`)

  // Remove all nodes for this database
  await agentDb.run(`
    ?[id] := *db_node{id, name}, name = '${escapeString(databaseName)}'
    :rm db_node {id}
  `)

  await agentDb.run(`
    ?[id] := *schema_node{id, db}, db = 'db:${escapeString(databaseName)}'
    :rm schema_node {id}
  `)

  // Tables, columns, etc. should cascade if foreign keys are set up
  // Otherwise, explicitly delete them

  console.log(`[DB Indexer] Schema cleared`)
}

/**
 * Query: Find tables by name pattern
 */
export async function findTables(
  agentDb: AgentDatabase,
  namePattern: string
): Promise<Array<{ table_id: string; table_name: string; schema: string }>> {
  const result = await agentDb.run(`
    ?[table_id, table_name, schema] :=
      *table_node{id: table_id, name: table_name, schema},
      table_name ~~ '${escapeString(namePattern)}'
  `)

  return result.rows.map((row: any[]) => ({
    table_id: row[0],
    table_name: row[1],
    schema: row[2],
  }))
}

/**
 * Query: Find columns in a table
 */
export async function findColumnsInTable(
  agentDb: AgentDatabase,
  tableName: string
): Promise<Array<{ column_name: string; data_type: string; nullable: boolean }>> {
  const result = await agentDb.run(`
    ?[column_name, data_type, nullable] :=
      *table_node{id: table_id, name: table_name},
      *column_node{table: table_id, name: column_name, data_type, nullable},
      table_name = '${escapeString(tableName)}'
  `)

  return result.rows.map((row: any[]) => ({
    column_name: row[0],
    data_type: row[1],
    nullable: row[2],
  }))
}

/**
 * Query: Find foreign key relationships from a table
 */
export async function findForeignKeysFromTable(
  agentDb: AgentDatabase,
  tableName: string
): Promise<Array<{
  from_column: string
  to_table: string
  to_column: string
  on_delete: string
}>> {
  const result = await agentDb.run(`
    ?[from_column, to_table, to_column, on_delete] :=
      *fk_edge{
        src_table,
        src_col: from_column,
        dst_table: to_table,
        dst_col: to_column,
        on_delete
      },
      src_table ~~ '%${escapeString(tableName)}'
  `)

  return result.rows.map((row: any[]) => ({
    from_column: row[0],
    to_table: row[1],
    to_column: row[2],
    on_delete: row[3],
  }))
}

/**
 * Query: Impact analysis - What depends on this table?
 */
export async function findTableDependents(
  agentDb: AgentDatabase,
  tableName: string
): Promise<{
  foreignKeysFrom: string[] // Tables that reference this table
  views: string[] // Views that depend on this table
}> {
  // Find tables with FKs pointing to this table
  const fkResult = await agentDb.run(`
    ?[src_table] :=
      *fk_edge{src_table, dst_table},
      dst_table ~~ '%${escapeString(tableName)}'
  `)

  // Find views (simplified - would need parsing for real dependencies)
  const viewResult = await agentDb.run(`
    ?[view_name] :=
      *view_node{name: view_name, definition},
      definition ~~ '%${escapeString(tableName)}%'
  `)

  return {
    foreignKeysFrom: fkResult.rows.map((row: any[]) => row[0]),
    views: viewResult.rows.map((row: any[]) => row[0]),
  }
}

/**
 * Query: Impact analysis - What breaks if I change this column type?
 */
export async function analyzeColumnTypeChange(
  agentDb: AgentDatabase,
  tableName: string,
  columnName: string
): Promise<{
  foreignKeyConstraints: string[] // FK constraints using this column
  indexes: string[] // Indexes using this column
  views: string[] // Views potentially affected
}> {
  const tablePattern = `%${escapeString(tableName)}`
  const columnPattern = escapeString(columnName)

  // Find FK constraints
  const fkResult = await agentDb.run(`
    ?[src_table, from_col, to_table] :=
      *fk_edge{src_table, src_col: from_col, dst_table: to_table},
      (src_table ~~ '${tablePattern}', from_col = '${columnPattern}') or
      (dst_table ~~ '${tablePattern}', dst_col: '${columnPattern}')
  `)

  // Find indexes
  const indexResult = await agentDb.run(`
    ?[index_name] :=
      *table_node{id: table_id, name: table_name},
      *column_node{id: col_id, table: table_id, name: col_name},
      *index_on{index, column: col_id},
      *index_node{id: index, name: index_name},
      table_name = '${escapeString(tableName)}',
      col_name = '${columnPattern}'
  `)

  // Find views (simplified)
  const viewResult = await agentDb.run(`
    ?[view_name] :=
      *view_node{name: view_name, definition},
      definition ~~ '%${escapeString(tableName)}%',
      definition ~~ '%${columnPattern}%'
  `)

  return {
    foreignKeyConstraints: fkResult.rows.map((row: any[]) => `${row[0]}.${row[1]} → ${row[2]}`),
    indexes: indexResult.rows.map((row: any[]) => row[0]),
    views: viewResult.rows.map((row: any[]) => row[0]),
  }
}

/**
 * Escape single quotes for CozoDB
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}
