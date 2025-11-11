/**
 * PostgreSQL Schema Introspector
 * Queries information_schema and pg_catalog to extract database schema
 */

import { Pool, PoolConfig } from 'pg'
import { dbId } from './id'

export interface DbSchema {
  database: string
  schemas: SchemaInfo[]
}

export interface SchemaInfo {
  schema_id: string
  schema_name: string
  tables: TableInfo[]
  views: ViewInfo[]
  enums: EnumInfo[]
  procedures: ProcedureInfo[]
}

export interface TableInfo {
  table_id: string
  table_name: string
  schema_name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  constraints: ConstraintInfo[]
  foreign_keys: ForeignKeyInfo[]
}

export interface ColumnInfo {
  column_id: string
  column_name: string
  table_id: string
  data_type: string
  udt_name: string
  is_nullable: boolean
  column_default: string | null
  ordinal_position: number
}

export interface IndexInfo {
  index_id: string
  index_name: string
  table_id: string
  is_unique: boolean
  is_primary: boolean
  index_type: string
  columns: string[]
}

export interface ConstraintInfo {
  constraint_id: string
  constraint_name: string
  table_id: string
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK'
  definition: string
}

export interface ForeignKeyInfo {
  fk_id: string
  fk_name: string
  from_table: string
  from_column: string
  to_table: string
  to_column: string
  on_delete: string
  on_update: string
}

export interface ViewInfo {
  view_id: string
  view_name: string
  schema_name: string
  definition: string
  depends_on: string[] // Table/view names
}

export interface EnumInfo {
  enum_id: string
  enum_name: string
  schema_name: string
  values: string[]
}

export interface ProcedureInfo {
  proc_id: string
  proc_name: string
  schema_name: string
  kind: 'FUNCTION' | 'PROCEDURE'
  language: string
  definition: string
}

/**
 * Create PostgreSQL connection pool
 */
export function createPgPool(config: PoolConfig): Pool {
  return new Pool(config)
}

/**
 * Introspect entire database schema
 */
export async function introspectDatabase(
  pool: Pool,
  options: {
    includeSchemas?: string[] // Default: ['public']
    excludeSchemas?: string[] // Default: ['information_schema', 'pg_catalog']
  } = {}
): Promise<DbSchema> {
  const includeSchemas = options.includeSchemas || ['public']
  const excludeSchemas = options.excludeSchemas || ['information_schema', 'pg_catalog', 'pg_toast']

  console.log('[PG Introspector] Starting database introspection...')

  // Get database name
  const dbResult = await pool.query('SELECT current_database() as dbname')
  const database = dbResult.rows[0].dbname

  // Get schemas
  const schemaQuery = `
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name = ANY($1::text[])
      AND schema_name != ALL($2::text[])
    ORDER BY schema_name
  `
  const schemaResult = await pool.query(schemaQuery, [includeSchemas, excludeSchemas])

  const schemas: SchemaInfo[] = []

  for (const row of schemaResult.rows) {
    const schemaName = row.schema_name
    console.log(`[PG Introspector] Processing schema: ${schemaName}`)

    const schema: SchemaInfo = {
      schema_id: dbId.schema(database, schemaName),
      schema_name: schemaName,
      tables: await introspectTables(pool, database, schemaName),
      views: await introspectViews(pool, database, schemaName),
      enums: await introspectEnums(pool, database, schemaName),
      procedures: await introspectProcedures(pool, database, schemaName),
    }

    schemas.push(schema)
  }

  console.log('[PG Introspector] ✅ Introspection complete')

  return {
    database,
    schemas,
  }
}

/**
 * Introspect tables in a schema
 */
async function introspectTables(
  pool: Pool,
  database: string,
  schemaName: string
): Promise<TableInfo[]> {
  const tableQuery = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  const tableResult = await pool.query(tableQuery, [schemaName])

  const tables: TableInfo[] = []

  for (const row of tableResult.rows) {
    const tableName = row.table_name
    const tableId = dbId.table(dbId.schema(database, schemaName), tableName)

    const table: TableInfo = {
      table_id: tableId,
      table_name: tableName,
      schema_name: schemaName,
      columns: await introspectColumns(pool, tableId, schemaName, tableName),
      indexes: await introspectIndexes(pool, tableId, schemaName, tableName),
      constraints: await introspectConstraints(pool, tableId, schemaName, tableName),
      foreign_keys: await introspectForeignKeys(pool, schemaName, tableName),
    }

    tables.push(table)
  }

  console.log(`[PG Introspector]   Found ${tables.length} tables in ${schemaName}`)
  return tables
}

/**
 * Introspect columns in a table
 */
async function introspectColumns(
  pool: Pool,
  tableId: string,
  schemaName: string,
  tableName: string
): Promise<ColumnInfo[]> {
  const columnQuery = `
    SELECT
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default,
      ordinal_position
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
    ORDER BY ordinal_position
  `
  const result = await pool.query(columnQuery, [schemaName, tableName])

  return result.rows.map((row) => ({
    column_id: dbId.column(tableId, row.column_name),
    column_name: row.column_name,
    table_id: tableId,
    data_type: row.data_type,
    udt_name: row.udt_name,
    is_nullable: row.is_nullable === 'YES',
    column_default: row.column_default,
    ordinal_position: row.ordinal_position,
  }))
}

/**
 * Introspect indexes in a table
 */
async function introspectIndexes(
  pool: Pool,
  tableId: string,
  schemaName: string,
  tableName: string
): Promise<IndexInfo[]> {
  const indexQuery = `
    SELECT
      i.relname as index_name,
      ix.indisunique as is_unique,
      ix.indisprimary as is_primary,
      am.amname as index_type,
      array_agg(a.attname ORDER BY a.attnum) as columns
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
      AND t.relname = $2
    GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
  `
  const result = await pool.query(indexQuery, [schemaName, tableName])

  return result.rows.map((row) => ({
    index_id: dbId.index(tableId, row.index_name),
    index_name: row.index_name,
    table_id: tableId,
    is_unique: row.is_unique,
    is_primary: row.is_primary,
    index_type: row.index_type,
    columns: row.columns,
  }))
}

/**
 * Introspect constraints in a table
 */
async function introspectConstraints(
  pool: Pool,
  tableId: string,
  schemaName: string,
  tableName: string
): Promise<ConstraintInfo[]> {
  const constraintQuery = `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      pg_get_constraintdef(c.oid) as definition
    FROM information_schema.table_constraints tc
    JOIN pg_constraint c ON c.conname = tc.constraint_name
    WHERE tc.table_schema = $1
      AND tc.table_name = $2
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'CHECK')
  `
  const result = await pool.query(constraintQuery, [schemaName, tableName])

  return result.rows.map((row) => ({
    constraint_id: dbId.constraint(tableId, row.constraint_name),
    constraint_name: row.constraint_name,
    table_id: tableId,
    constraint_type: row.constraint_type,
    definition: row.definition,
  }))
}

/**
 * Introspect foreign keys
 */
async function introspectForeignKeys(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<ForeignKeyInfo[]> {
  const fkQuery = `
    SELECT
      tc.constraint_name,
      kcu.column_name as from_column,
      ccu.table_name as to_table,
      ccu.column_name as to_column,
      rc.delete_rule as on_delete,
      rc.update_rule as on_update
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
  `
  const result = await pool.query(fkQuery, [schemaName, tableName])

  return result.rows.map((row) => ({
    fk_id: `fk:${schemaName}.${tableName}.${row.constraint_name}`,
    fk_name: row.constraint_name,
    from_table: `${schemaName}.${tableName}`,
    from_column: row.from_column,
    to_table: `${schemaName}.${row.to_table}`,
    to_column: row.to_column,
    on_delete: row.on_delete,
    on_update: row.on_update,
  }))
}

/**
 * Introspect views
 */
async function introspectViews(
  pool: Pool,
  database: string,
  schemaName: string
): Promise<ViewInfo[]> {
  const viewQuery = `
    SELECT
      table_name as view_name,
      view_definition as definition
    FROM information_schema.views
    WHERE table_schema = $1
  `
  const result = await pool.query(viewQuery, [schemaName])

  console.log(`[PG Introspector]   Found ${result.rows.length} views in ${schemaName}`)

  return result.rows.map((row) => ({
    view_id: dbId.view(dbId.schema(database, schemaName), row.view_name),
    view_name: row.view_name,
    schema_name: schemaName,
    definition: row.definition,
    depends_on: [], // TODO: Parse dependencies from definition
  }))
}

/**
 * Introspect enums
 */
async function introspectEnums(
  pool: Pool,
  database: string,
  schemaName: string
): Promise<EnumInfo[]> {
  const enumQuery = `
    SELECT
      t.typname as enum_name,
      array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = $1
    GROUP BY t.typname
  `
  const result = await pool.query(enumQuery, [schemaName])

  console.log(`[PG Introspector]   Found ${result.rows.length} enums in ${schemaName}`)

  return result.rows.map((row) => ({
    enum_id: dbId.enum(dbId.schema(database, schemaName), row.enum_name),
    enum_name: row.enum_name,
    schema_name: schemaName,
    values: row.values,
  }))
}

/**
 * Introspect procedures/functions
 */
async function introspectProcedures(
  pool: Pool,
  database: string,
  schemaName: string
): Promise<ProcedureInfo[]> {
  const procQuery = `
    SELECT
      p.proname as proc_name,
      CASE p.prokind
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'p' THEN 'PROCEDURE'
        ELSE 'FUNCTION'
      END as kind,
      l.lanname as language,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = $1
      AND l.lanname != 'internal'
  `
  const result = await pool.query(procQuery, [schemaName])

  console.log(`[PG Introspector]   Found ${result.rows.length} procedures/functions in ${schemaName}`)

  return result.rows.map((row) => ({
    proc_id: dbId.proc(dbId.schema(database, schemaName), row.proc_name),
    proc_name: row.proc_name,
    schema_name: schemaName,
    kind: row.kind,
    language: row.language,
    definition: row.definition,
  }))
}
