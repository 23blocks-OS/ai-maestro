#!/usr/bin/env node
// Prune ~/.aimaestro/backups/agents by hand. Dry run by default; pass --apply to delete.
// Run with tsx: npx tsx scripts/prune-agent-backups.mjs [--apply]
// Env: AIM_BACKUP_KEEP (default 5, "all" disables), AIM_BACKUP_MAX_AGE_DAYS (default 30).
import { pruneAgentBackups } from '../lib/agent-backup-retention.ts'

const apply = process.argv.includes('--apply')
const r = pruneAgentBackups({ dryRun: !apply })
if (r.disabled) console.log('Pruning disabled (AIM_BACKUP_KEEP=all).')
console.log(`${apply ? 'Removed' : 'Would remove'} ${r.removed.length}, keep ${r.kept.length}${r.failed.length ? `, failed ${r.failed.length}` : ''}`)
for (const n of r.removed) console.log(`  ${apply ? 'removed' : 'would remove'} ${n}`)
if (!apply && r.removed.length) console.log('Re-run with --apply to delete.')
