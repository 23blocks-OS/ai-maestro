#!/usr/bin/env tsx
/**
 * Initialize Database Schema Index
 * One-time script to introspect and index a PostgreSQL database schema
 *
 * Usage:
 *   tsx scripts/rag/init-db-schema.ts <agentId> <dbConnectionString>
 *
 * Example:
 *   tsx scripts/rag/init-db-schema.ts backend-architect "postgresql://user:pass@localhost:5432/mydb"
 *
 * Connection string format:
 *   postgresql://[user[:password]@][host][:port]/database[?param=value&...]
 */

import { createAgentDatabase } from '../../lib/cozo-db'
import { createPgPool, introspectDatabase } from '../../lib/rag/pg-introspector'
import { indexDatabaseSchema, clearDatabaseSchema } from '../../lib/rag/db-indexer'

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: tsx scripts/rag/init-db-schema.ts <agentId> <dbConnectionString>')
    console.error('Example: tsx scripts/rag/init-db-schema.ts backend-architect "postgresql://localhost:5432/mydb"')
    process.exit(1)
  }

  const [agentId, connectionString] = args

  console.log(`\n🗄️  Database Schema Index Initialization`)
  console.log(`Agent: ${agentId}`)
  console.log(`Database: ${connectionString.split('@')[1] || connectionString}\n`)

  try {
    // Initialize PostgreSQL connection
    console.log('[1/4] Connecting to PostgreSQL...')
    const pool = createPgPool({ connectionString })

    // Test connection
    await pool.query('SELECT current_database()')
    console.log('✓ Connected successfully')

    // Initialize agent database
    console.log('\n[2/4] Initializing agent database...')
    const agentDb = await createAgentDatabase({ agentId })

    // Introspect database schema
    console.log('\n[3/4] Introspecting database schema...')
    const dbSchema = await introspectDatabase(pool, {
      includeSchemas: ['public'], // Modify as needed
    })

    console.log(`\nDiscovered:`)
    console.log(`  Schemas: ${dbSchema.schemas.length}`)
    dbSchema.schemas.forEach((schema) => {
      console.log(`    ${schema.schema_name}:`)
      console.log(`      Tables: ${schema.tables.length}`)
      console.log(`      Views: ${schema.views.length}`)
      console.log(`      Enums: ${schema.enums.length}`)
      console.log(`      Procedures: ${schema.procedures.length}`)
    })

    // Clear existing schema (optional - comment out to keep existing data)
    console.log(`\n[4/4] Clearing existing schema and indexing...`)
    await clearDatabaseSchema(agentDb, dbSchema.database)

    // Index schema into CozoDB
    const stats = await indexDatabaseSchema(agentDb, dbSchema)

    console.log(`\n✅ Database schema indexed!`)
    console.log(`\nStats:`)
    console.log(`  Schemas: ${stats.schemasIndexed}`)
    console.log(`  Tables: ${stats.tablesIndexed}`)
    console.log(`  Columns: ${stats.columnsIndexed}`)
    console.log(`  Indexes: ${stats.indexesIndexed}`)
    console.log(`  Constraints: ${stats.constraintsIndexed}`)
    console.log(`  Foreign Keys: ${stats.foreignKeysIndexed}`)
    console.log(`  Views: ${stats.viewsIndexed}`)
    console.log(`  Enums: ${stats.enumsIndexed}`)
    console.log(`  Procedures: ${stats.proceduresIndexed}`)
    console.log(`  Duration: ${stats.durationMs}ms\n`)

    // Cleanup
    await pool.end()
    await agentDb.close()

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
