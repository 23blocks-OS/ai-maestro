#!/usr/bin/env tsx
/**
 * Update Code Index (Incremental)
 * Indexes only changed files since last commit
 *
 * Usage:
 *   tsx scripts/rag/update-code-index.ts <agentId> <projectPath> [commitHash]
 *
 * Example:
 *   tsx scripts/rag/update-code-index.ts backend-architect /Users/juan/myproject
 *   tsx scripts/rag/update-code-index.ts backend-architect /Users/juan/myproject HEAD~1
 */

import { createAgentDatabase } from '../../lib/cozo-db'
import { indexFiles } from '../../lib/rag/code-indexer'
import { execSync } from 'child_process'
import * as path from 'path'

/**
 * Get changed files from git
 */
function getChangedFiles(projectPath: string, since?: string): string[] {
  const gitCommand = since
    ? `git diff --name-only ${since} HEAD`
    : `git diff --name-only HEAD`

  try {
    const output = execSync(gitCommand, {
      cwd: projectPath,
      encoding: 'utf-8',
    })

    const allFiles = output
      .split('\n')
      .filter((line) => line.trim())
      .map((file) => path.join(projectPath, file))

    // Filter for TypeScript/JavaScript files
    const codeFiles = allFiles.filter((file) =>
      /\.(ts|tsx|js|jsx)$/.test(file) && !file.includes('node_modules')
    )

    return codeFiles
  } catch (error) {
    console.error('Error getting changed files:', error)
    return []
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: tsx scripts/rag/update-code-index.ts <agentId> <projectPath> [commitHash]')
    console.error('Example: tsx scripts/rag/update-code-index.ts backend-architect /Users/juan/myproject')
    process.exit(1)
  }

  const [agentId, projectPath, since] = args

  console.log(`\n🔄 Incremental Code Index Update`)
  console.log(`Agent: ${agentId}`)
  console.log(`Project: ${projectPath}`)
  if (since) console.log(`Since: ${since}`)
  console.log()

  try {
    // Get changed files
    console.log('[1/3] Finding changed files...')
    const changedFiles = getChangedFiles(projectPath, since)

    if (changedFiles.length === 0) {
      console.log('✅ No code files changed. Nothing to index.')
      process.exit(0)
    }

    console.log(`Found ${changedFiles.length} changed files:`)
    changedFiles.forEach((file) => {
      console.log(`  - ${path.relative(projectPath, file)}`)
    })

    // Initialize agent database
    console.log('\n[2/3] Initializing agent database...')
    const agentDb = await createAgentDatabase({ agentId })

    // Index changed files
    console.log('[3/3] Indexing changed files...')
    const stats = await indexFiles(agentDb, projectPath, changedFiles)

    console.log(`\n✅ Incremental index complete!`)
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
