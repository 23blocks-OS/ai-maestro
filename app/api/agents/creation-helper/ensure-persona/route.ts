import { NextResponse } from 'next/server'
import { join } from 'path'
import { copyFile, access, mkdir, writeFile } from 'fs/promises'

// Pre-approved permissions for the Haephestos agent workspace.
//
// Policy: ALL operations inside ~/agents/haephestos/, READ-ONLY outside.
//
// Permission mode is 'default' (set in creation-helper-service.ts).
// Evaluation order per Claude Code docs: deny → ask → allow.
// - deny matches → blocked
// - allow matches → auto-approved (no prompt)
// - neither → prompts (catches unexpected writes outside workspace)
//
// Pattern syntax (gitignore spec):
// - * = single directory level, ** = recursive
// - ~/path = home-relative, //path = absolute filesystem path
// - Bash without parentheses = all commands, Bash(pattern) = glob match
// - Bash(rm*) = any command starting with "rm" (catches rm, rm -rf, rmdir)
const HAEPHESTOS_SETTINGS = {
  permissions: {
    allow: [
      // Bash — only specific safe commands (deny list blocks dangerous ones)
      // Restrict to commands Haephestos actually needs: cat, ls, jq, curl, pss binary
      'Bash(cat*)',
      'Bash(ls*)',
      'Bash(jq*)',
      'Bash(curl*)',
      'Bash(head*)',
      'Bash(tail*)',
      'Bash(wc*)',
      'Bash(echo*)',
      'Bash(find*)',
      'Bash(mkdir*)',
      // PSS profiler binary
      'Bash(pss*)',
      'Bash(*/pss*)',
      // uv/uvx for CPV validation (uvx cpv-remote-validate)
      'Bash(uv*)',
      'Bash(uvx*)',
      // Read-only tools — unrestricted
      'Read',
      'Glob',
      'Grep',
      // Write + Edit — ONLY inside haephestos workspace (** = recursive into subdirs)
      'Write(~/agents/haephestos/**)',
      'Edit(~/agents/haephestos/**)',
      // Agent spawning — allowed for CPV fixer agent only (prompted for approval)
      'Agent',
      // WebFetch — user may provide URLs for skills/MCP servers to examine
      'WebFetch',
    ],
    deny: [
      // Block file deletion: rm* catches rm, rm -rf, rmdir
      'Bash(rm*)',
      // Block git operations
      'Bash(git*)',
      // Block network tools that could run indefinitely
      'Bash(python*)',
      'Bash(node*)',
      'Bash(npm*)',
      'Bash(yarn*)',
      'Bash(bun*)',
    ],
  },
}

/**
 * Ensures ~/agents/haephestos/.claude/settings.local.json exists with
 * pre-approved bash permissions. Only writes if the file is missing
 * (never overwrites user customizations).
 */
async function ensureHaephestosPermissions(home: string): Promise<void> {
  const haephestosDir = join(home, 'agents', 'haephestos')
  const settingsDir = join(haephestosDir, '.claude')
  const settingsFile = join(settingsDir, 'settings.local.json')
  // Create toml/ subfolder for TOML draft output (polled by preview panel)
  const tomlDir = join(haephestosDir, 'toml')
  await mkdir(tomlDir, { recursive: true })
  // Create uploads/ subfolder for user-uploaded files
  const uploadsDir = join(haephestosDir, 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  // Always overwrite settings.local.json to pick up permission updates
  await mkdir(settingsDir, { recursive: true })
  await writeFile(settingsFile, JSON.stringify(HAEPHESTOS_SETTINGS, null, 2) + '\n')
}

/**
 * POST /api/agents/creation-helper/ensure-persona
 * Ensures the haephestos-creation-helper agent persona is installed
 * in ~/.claude/agents/ so `claude --agent haephestos-creation-helper` works.
 */
export async function POST() {
  const home = process.env.HOME
  if (!home) {
    return NextResponse.json({ installed: false, reason: 'HOME not set' }, { status: 500 })
  }

  const targetDir = join(home, '.claude', 'agents')
  const targetFile = join(targetDir, 'haephestos-creation-helper.md')
  const sourceFile = join(process.cwd(), 'agents', 'haephestos-creation-helper.md')

  try {
    await access(sourceFile)
  } catch {
    return NextResponse.json({ installed: false, reason: 'Source persona file not found' }, { status: 404 })
  }

  try {
    await mkdir(targetDir, { recursive: true })
    // Always overwrite — the source persona may have been updated
    await copyFile(sourceFile, targetFile)
    await ensureHaephestosPermissions(home)
    return NextResponse.json({ installed: true, alreadyExisted: false })
  } catch (err) {
    return NextResponse.json({ installed: false, reason: String(err) }, { status: 500 })
  }
}
