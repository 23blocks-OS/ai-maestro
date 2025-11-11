#!/usr/bin/env tsx
/**
 * Initialize Code Index
 * One-time script to index an entire codebase for an agent
 *
 * Usage:
 *   tsx scripts/rag/init-code-index.ts <agentId> <projectPath>
 *
 * Example:
 *   tsx scripts/rag/init-code-index.ts backend-architect /Users/juan/myproject
 */

import { createAgentDatabase } from '../../lib/cozo-db'
import { indexProject, clearCodeGraph } from '../../lib/rag/code-indexer'

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: tsx scripts/rag/init-code-index.ts <agentId> <projectPath>')
    console.error('Example: tsx scripts/rag/init-code-index.ts backend-architect /Users/juan/myproject')
    process.exit(1)
  }

  const [agentId, projectPath] = args

  console.log(`\n🚀 Code Index Initialization`)
  console.log(`Agent: ${agentId}`)
  console.log(`Project: ${projectPath}\n`)

  try {
    // Initialize agent database
    console.log('[1/3] Initializing agent database...')
    const agentDb = await createAgentDatabase({ agentId })

    // Clear existing code graph
    console.log('[2/3] Clearing existing code graph...')
    await clearCodeGraph(agentDb, projectPath)

    // Index project
    console.log('[3/3] Indexing project...')
    const stats = await indexProject(agentDb, projectPath, {
      includePatterns: [
        'lib/**/*.ts',
        'lib/**/*.tsx',
        'app/**/*.ts',
        'app/**/*.tsx',
        'components/**/*.tsx',
        'hooks/**/*.ts',
        'types/**/*.ts',
      ],
      onProgress: (status) => {
        console.log(`  ${status}`)
      },
    })

    console.log(`\n✅ Code index complete!`)
    console.log(`\nStats:`)
    console.log(`  Files indexed: ${stats.filesIndexed}`)
    console.log(`  Functions: ${stats.functionsIndexed}`)
    console.log(`  Components: ${stats.componentsIndexed}`)
    console.log(`  Imports: ${stats.importsIndexed}`)
    console.log(`  Calls: ${stats.callsIndexed}`)
    console.log(`  Duration: ${stats.durationMs}ms\n`)

    await agentDb.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
