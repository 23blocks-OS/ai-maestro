#!/usr/bin/env tsx
/**
 * Check if an agent's database has RAG tables installed
 *
 * Usage:
 *   tsx scripts/rag/check-rag-tables.ts <agentId>
 *
 * Example:
 *   tsx scripts/rag/check-rag-tables.ts 23blocks-IaC
 */

import { createAgentDatabase } from '../../lib/cozo-db'

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.error('Usage: tsx scripts/rag/check-rag-tables.ts <agentId>')
    console.error('Example: tsx scripts/rag/check-rag-tables.ts 23blocks-IaC')
    process.exit(1)
  }

  const agentId = args[0]

  console.log(`\n🔍 Checking RAG tables for agent: ${agentId}\n`)

  try {
    // Connect to agent database
    const agentDb = await createAgentDatabase({ agentId })

    // List of RAG tables to check
    const ragTables = [
      // Message indexing tables
      'messages',
      'msg_vec',
      'msg_terms',
      'code_symbols',

      // Code graph tables
      'files',
      'functions',
      'components',
      'services',
      'apis',
      'declares',
      'imports',
      'calls',

      // Database schema graph tables
      'db_node',
      'schema_node',
      'table_node',
      'column_node',
      'index_node',
      'constraint_node',
      'view_node',
      'enum_node',
      'enum_value',
      'proc_node',
      'fk_edge',
      'index_on',
    ]

    console.log('Checking for RAG tables...\n')

    const results: { table: string; exists: boolean; rowCount?: number }[] = []

    for (const tableName of ragTables) {
      try {
        // Try to query the table - use ::<tablename> to list relations
        // For stored relations, we can query their existence
        const result = await agentDb.run(`::relations`)

        // Check if table exists in the relations list
        const tableExists = result.rows.some((row: any[]) => row[0] === tableName)

        if (tableExists) {
          // Try to count rows
          let rowCount = 0
          try {
            // Get first column name from table schema
            const schemaResult = await agentDb.run(`::columns ${tableName}`)
            if (schemaResult.rows.length > 0) {
              const firstCol = schemaResult.rows[0][0]
              // Count rows using the first column
              const countResult = await agentDb.run(`
                ?[count(${firstCol})] := *${tableName}{${firstCol}}
              `)
              rowCount = countResult.rows[0]?.[0] || 0
            }
          } catch {
            // Counting failed, but table exists
            rowCount = -1
          }

          results.push({ table: tableName, exists: true, rowCount })
          const rowInfo = rowCount === -1 ? 'exists (count N/A)' : `${rowCount} rows`
          console.log(`✅ ${tableName.padEnd(20)} - ${rowInfo}`)
        } else {
          results.push({ table: tableName, exists: false })
          console.log(`❌ ${tableName.padEnd(20)} - NOT FOUND`)
        }
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          results.push({ table: tableName, exists: false })
          console.log(`❌ ${tableName.padEnd(20)} - NOT FOUND`)
        } else {
          results.push({ table: tableName, exists: false })
          console.log(`⚠️  ${tableName.padEnd(20)} - ERROR: ${error.message}`)
        }
      }
    }

    // Summary
    const existingTables = results.filter(r => r.exists)
    const missingTables = results.filter(r => !r.exists)

    console.log(`\n📊 Summary:`)
    console.log(`   Total RAG tables: ${ragTables.length}`)
    console.log(`   ✅ Existing: ${existingTables.length}`)
    console.log(`   ❌ Missing: ${missingTables.length}`)

    if (missingTables.length > 0) {
      console.log(`\n⚠️  Missing tables: ${missingTables.map(t => t.table).join(', ')}`)
      console.log(`\nTo initialize RAG schema, the auto-migration should run on next database access.`)
      console.log(`Or manually run: await initializeRagSchema(agentDb)`)
    } else {
      console.log(`\n🎉 All RAG tables are present!`)
    }

    // Close database
    await agentDb.close()

    process.exit(missingTables.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
