/**
 * Plugin Builder Types
 * Types for the visual plugin builder that composes Claude Code plugins
 * from multiple sources (marketplace, git repos, core skills).
 */

// ============================================================================
// Build Configuration
// ============================================================================

/**
 * Configuration for building a plugin
 * Submitted by the UI to POST /api/plugin-builder/build
 */
export interface PluginBuildConfig {
  name: string                         // Plugin name (e.g., "my-backend-agent")
  version: string                      // Semver (e.g., "1.0.0")
  description?: string                 // Human-readable description
  author?: { name: string }            // Plugin author metadata
  homepage?: string                    // Plugin homepage URL
  skills: PluginSkillSelection[]       // Selected skills from various sources
  includeHooks?: boolean               // Include default hooks (default: true)
}

/**
 * A skill selected for inclusion in the plugin.
 * Tagged union — the UI sends one of these per selected skill.
 */
export type PluginSkillSelection =
  | { type: 'core'; name: string }
  | { type: 'marketplace'; id: string; marketplace: string; plugin: string; name: string }
  | { type: 'repo'; url: string; ref: string; skillPath: string; name: string }

// ============================================================================
// Build Results
// ============================================================================

/**
 * Result of a plugin build (returned from the API)
 */
export interface PluginBuildResult {
  buildId: string
  status: 'building' | 'complete' | 'failed'
  outputPath?: string                  // Where the built plugin lives
  logs: string[]                       // Build output lines
  manifest?: PluginManifest            // Generated manifest
  stats?: PluginBuildStats
  createdAt: string                    // ISO timestamp
}

export interface PluginBuildStats {
  skills: number
  scripts: number
  hooks: number
}

// ============================================================================
// Manifest Types (mirrors plugin.manifest.json structure)
// ============================================================================

/**
 * The plugin.manifest.json format used by build-plugin.sh
 */
export interface PluginManifest {
  name: string
  version: string
  description?: string
  output: string                       // Output directory (relative)
  plugin: PluginManifestMetadata
  sources: PluginManifestSource[]
}

export interface PluginManifestMetadata {
  // name and version are already at the PluginManifest top level; not repeated here
  author?: { name: string }
  homepage?: string
  license?: string
}

// Tagged union enforces that path is only valid for local sources and
// repo/ref are only valid for git sources — no invalid combinations possible.
export type PluginManifestSource =
  | {
      name: string
      description?: string
      type: 'local'
      path: string                     // Required for local sources
      map: Record<string, string>      // Source pattern -> output pattern
    }
  | {
      name: string
      description?: string
      type: 'git'
      repo: string                     // Required for git sources
      ref: string                      // Resolved Git branch or tag (e.g. 'main', 'v1.2.0') — must be non-empty; callers must resolve any default before constructing this object
      map: Record<string, string>      // skillPath (relative path within repo) -> output pattern (e.g. 'skills/deploy')
    }

// ============================================================================
// Repo Scanner
// ============================================================================

/**
 * Result of scanning a GitHub repo for skills
 */
export interface RepoScanResult {
  url: string
  ref: string
  skills: RepoSkillInfo[]
  scripts: RepoScriptInfo[]
}

export interface RepoSkillInfo {
  name: string                         // Skill folder name
  path: string                         // Relative path within repo (e.g., "skills/deploy")
  description?: string                 // From SKILL.md frontmatter (may be absent)
}

export interface RepoScriptInfo {
  name: string                         // Script filename
  path: string                         // Relative path within repo
}

// ============================================================================
// Push to GitHub
// ============================================================================

export interface PluginPushConfig {
  forkUrl: string                      // User's fork URL
  manifest: PluginManifest             // Generated manifest to push
  branch?: string                      // Target branch (default: "main")
}

export interface PluginPushResult {
  status: 'pushed' | 'failed'
  message: string
  commitUrl?: string
}
