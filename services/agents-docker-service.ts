/**
 * Agents Docker Service
 *
 * Business logic for creating agents in Docker containers.
 * Routes are thin wrappers that call these functions.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import { createAgent, deleteAgent, getAgent, loadAgents, saveAgents, updateAgent } from '@/lib/agent-registry'
import { getHosts, isSelf, getOrganization } from '@/lib/hosts-config'
import { generateKeyPair, saveKeyPair } from '@/lib/amp-keys'
import { registerAgent } from '@/services/amp-service'
import { type ServiceResult, missingField, operationFailed, invalidRequest, invalidState, notFound, gone, serviceError } from '@/services/service-errors'
import type { Agent, SandboxMount } from '@/types/agent'
import { PERMISSION_MODE_TO_CLI } from '@/types/agent'
import type { AgentPermissionMode } from '@/types/agent'
import { CONTAINER_CWD_GEMINI_PROJECT } from '@/lib/container-utils'

const execAsync = promisify(exec)

export interface DockerCreateRequest {
  name: string
  workingDirectory?: string
  hostId?: string
  program?: string
  /** @deprecated Use permissionMode: 'fullAutonomy' instead */
  yolo?: boolean
  permissionMode?: import('@/types/agent').AgentPermissionMode
  model?: string
  programArgs?: string
  prompt?: string
  timeout?: number
  githubToken?: string
  cpus?: number
  memory?: string
  autoRemove?: boolean
  label?: string
  avatar?: string
  mounts?: SandboxMount[]
  extraEnv?: Record<string, string>
  // Internal — set by recreateDockerAgent to migrate persisted claude/gh state
  // from the soft-deleted predecessor's per-UUID dir into the new agent's dir
  // BEFORE the container starts. Without this, /recreate's UUID rotation
  // forces every operator through the bypass-accept + claude OAuth + gh login
  // dance on every recreate — the bind mounts are per-UUID, so a fresh dir
  // means no preserved state. Not exposed in the dashboard create flow.
  persistFromAgentId?: string
}

// Reject paths that could break out of the quoted `-v "..."` shell argument.
const UNSAFE_PATH_CHARS = /["'`$\n\r\\]/

// Reject env values that could break out of the quoted `-e KEY="value"` shell
// argument, or smuggle a second flag into the docker invocation. Same character
// class as path validation — both are interpolated into a quoted shell string.
const UNSAFE_ENV_VALUE_CHARS = /["'`$\n\r\\]/

// POSIX env var name shape: leading letter or underscore, then alphanumerics
// or underscores. Matches what `env` and most shells will actually export.
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

// Container user/home for the standard cloud-agent image (agent-container/Dockerfile).
// Used to compute container-side paths for AMP common mounts. If the image's
// USER ever changes, update this and the Dockerfile together.
const CONTAINER_HOME = '/home/claude'

// Trusts the caller: sandbox.mounts is operator-declared today (e.g., agent
// creation by the dashboard or a host operator). If this ever becomes user-
// controlled (an agent mutating its own mounts, unprivileged operators), add
// realpath + prefix-check against an allow-list of host roots before shelling.

/**
 * Build the AI_TOOL command string for a Docker agent.
 * Extracted from createDockerAgent for testability.
 *
 * Resolution order for permission mode:
 *   1. body.permissionMode (explicit new field)
 *   2. body.yolo (legacy backward compat, maps to fullAutonomy)
 *   3. 'supervised' (default, no flag injected)
 */
export function buildAiToolCommand(body: Pick<DockerCreateRequest, 'program' | 'permissionMode' | 'yolo' | 'programArgs' | 'model' | 'prompt'>): string {
  const program = body.program || 'claude'
  let aiTool = program
  const effectivePermMode: AgentPermissionMode = body.permissionMode || (body.yolo ? 'fullAutonomy' : 'supervised')
  if (effectivePermMode !== 'supervised' && (program === 'claude' || program === 'claude-code')) {
    aiTool += ` --permission-mode ${PERMISSION_MODE_TO_CLI[effectivePermMode]}`
  }
  if (body.programArgs) {
    const sanitizedArgs = body.programArgs.replace(/[^a-zA-Z0-9\s\-_.=/:,~@]/g, '').trim()
    if (sanitizedArgs) aiTool += ` ${sanitizedArgs}`
  }
  if (body.model) {
    aiTool += ` --model ${body.model}`
  }
  if (body.prompt) {
    const escapedPrompt = body.prompt.replace(/'/g, "'\\''")
    aiTool += ` -p '${escapedPrompt}'`
  }
  return aiTool
}

export function validateMounts(mounts: SandboxMount[] | undefined): string | null {
  if (!mounts) return null
  for (const [i, m] of mounts.entries()) {
    if (typeof m?.hostPath !== 'string' || typeof m?.containerPath !== 'string') {
      return `mounts[${i}]: hostPath and containerPath are required strings`
    }
    if (!m.hostPath.startsWith('/') || !m.containerPath.startsWith('/')) {
      return `mounts[${i}]: hostPath and containerPath must be absolute paths`
    }
    if (UNSAFE_PATH_CHARS.test(m.hostPath) || UNSAFE_PATH_CHARS.test(m.containerPath)) {
      return `mounts[${i}]: paths must not contain quotes, backticks, $, backslashes, or newlines`
    }
    if (m.containerPath === '/workspace') {
      return `mounts[${i}]: /workspace is reserved for the agent working directory`
    }
  }
  return null
}

export function validateExtraEnv(env: Record<string, string> | undefined): string | null {
  if (!env) return null
  for (const [key, value] of Object.entries(env)) {
    if (!ENV_KEY_RE.test(key)) {
      return `extraEnv: invalid key "${key}" — must match ${ENV_KEY_RE}`
    }
    if (typeof value !== 'string') {
      return `extraEnv["${key}"]: value must be a string`
    }
    if (UNSAFE_ENV_VALUE_CHARS.test(value)) {
      return `extraEnv["${key}"]: value must not contain quotes, backticks, $, backslashes, or newlines`
    }
  }
  return null
}

export function buildMountFlags(mounts: SandboxMount[] | undefined): string[] {
  if (!mounts || mounts.length === 0) return []
  return mounts.map(m => {
    const suffix = m.readOnly ? ':ro' : ''
    return `-v "${m.hostPath}:${m.containerPath}${suffix}"`
  })
}

export function buildEnvFlags(env: Record<string, string> | undefined): string[] {
  if (!env) return []
  return Object.entries(env).map(([k, v]) => `-e ${k}="${v}"`)
}

// AMP common mounts wire the container so amp-helper.sh can resolve the agent's
// identity and find the AMP CLI on PATH. Without these, amp-helper falls back
// to the tmux session name and silently auto-creates a phantom empty identity
// with no signing key — every outbound message would be unverifiable.
//
// All three mounts are derived deterministically from the agent UUID, so they
// can be reproduced on container redeploy without operator input.
//
// Note: ~/.claude is intentionally NOT mounted wholesale — mounting the host
// operator's claude state into the container leaked host-absolute hook paths
// (every Stop/UserPromptSubmit fired MODULE_NOT_FOUND inside the container)
// and exposed the operator's full session history/projects/credentials read-
// write to the cloud agent. Per-container claude config is provisioned in
// provisionCloudClaudeConfig + buildCloudClaudeSettingsMount + buildCloudClaudePersistMounts.
export function buildAmpCommonMounts(
  agentId: string,
  hostHome: string = os.homedir(),
  repoRoot: string = process.cwd()
): SandboxMount[] {
  return [
    {
      hostPath: path.join(hostHome, '.agent-messaging', 'agents', agentId),
      containerPath: path.posix.join(CONTAINER_HOME, '.agent-messaging', 'agents', agentId),
    },
    {
      hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId),
      containerPath: path.posix.join(CONTAINER_HOME, '.aimaestro', 'agents', agentId),
    },
    {
      hostPath: path.join(hostHome, '.local', 'bin'),
      containerPath: path.posix.join(CONTAINER_HOME, '.local', 'bin'),
      readOnly: true,
    },
    // Shared shell-helpers dir (host-wide, not per-agent) — agent-helper.sh
    // sources `${HOME}/.local/share/aimaestro/shell-helpers/common.sh` at
    // line ~50; without this mount, every cloud agent hits "common.sh not
    // found" the moment it touches aimaestro-agent.sh. RO because the helper
    // scripts are identity-of-host-side state, not per-agent. Filed as
    // kanban 9c40609b 2026-04-28 by CelestIA after Luke (allianceos) repro.
    {
      hostPath: path.join(hostHome, '.local', 'share', 'aimaestro', 'shell-helpers'),
      containerPath: path.posix.join(CONTAINER_HOME, '.local', 'share', 'aimaestro', 'shell-helpers'),
      readOnly: true,
    },
    // Repo scripts dir (host-wide, RO) — exposes meeting-send.sh /
    // meeting-task.sh / meeting-read.sh + other operator CLIs to cloud agents
    // so they can participate in the team kanban + meeting flows from inside
    // the container. Without this, only meeting-send.sh worked (manually
    // installed in some operators' ~/.local/bin/) and meeting-task.sh was
    // universally absent fleet-wide (Optic + Hardin + cross-host empirical
    // 2026-05-06). The bind mount targets a known container path that gets
    // prepended to CONTAINER_PATH below — sister pattern to the shell-helpers
    // mount above. Sister to PR #98 / kanban 9c40609b.
    //
    // repoRoot defaults to process.cwd() (matches provisionCloudClaudeConfig
    // signature) — Next.js bundling moves __dirname into .next/server/...
    // so __dirname-relative paths break in production. The maestro server
    // always runs from the repo root, so process.cwd() is the canonical anchor.
    {
      hostPath: path.join(repoRoot, 'scripts'),
      containerPath: path.posix.join(CONTAINER_HOME, '.local', 'share', 'aimaestro', 'cli'),
      readOnly: true,
    },
  ]
}

// Copy a host-operator-owned source file into a per-agent destination path,
// preserving the operator's authentication state into the new agent's
// per-UUID dir. Used by the auth-bootstrap path (kanbans 354a5174 codex +
// 8aa61a60 claude) so freshly-created cloud agents inherit a valid login on
// first launch instead of forcing the operator through an in-container OAuth
// dance per agent.
//
// Returns true on a successful copy, false on any reason the seed didn't
// happen (dest already populated with real content — preserve existing
// per-agent rotation state; source missing — operator hasn't run the
// relevant `<cli> login` yet; copy failed — perm error logged non-fatal).
// Caller decides whether to fall back to an empty seed.
//
// Empty-placeholder semantics (kanban 02a8ebda): if the dest exists but
// holds only an empty seed (`{}` / `{}\n` / empty string), treat it as
// "not yet bootstrapped" and proceed with the host copy. Without this,
// agents created BEFORE the operator ran `<cli> login` would carry their
// `{}` placeholder forward across /recreate (migrateAgentPersistence copies
// it; this guard then short-circuited the re-bootstrap), forcing operators
// to manually `rm` the per-agent file before recreate. Watson surfaced
// during PR #103 Mason cross-test 2026-05-01.
//
// Mode 0o600 on the destination matches the source's typical perms (CLI
// credential files are operator-private). Per-agent file is written into
// ~/.aimaestro/agents/<id>/, isolated from the host operator's tree —
// future writes by the in-container CLI go to the per-agent file via the
// bind mount, not back to the host source.
export function seedFromHostFile(hostSourcePath: string, perAgentDestPath: string): boolean {
  if (fs.existsSync(perAgentDestPath) && !isEmptyJsonSeed(perAgentDestPath)) return false
  if (!fs.existsSync(hostSourcePath)) return false
  try {
    fs.copyFileSync(hostSourcePath, perAgentDestPath)
    fs.chmodSync(perAgentDestPath, 0o600)
    return true
  } catch (err) {
    console.warn(`[seedFromHostFile] copy ${hostSourcePath} -> ${perAgentDestPath}:`, err instanceof Error ? err.message : err)
    return false
  }
}

// Detect the empty-placeholder content that provisionCloudClaudeConfig +
// provisionCloudCodexAuth write when the host has no credentials yet
// (`{}\n` or an empty file). Used by seedFromHostFile to tell apart
// "intentionally empty placeholder, please re-bootstrap" from "operator's
// real rotated credentials, do not overwrite". Read failures fall through
// as "not empty" (conservative — preserve unknown content).
function isEmptyJsonSeed(filePath: string): boolean {
  try {
    const trimmed = fs.readFileSync(filePath, 'utf8').trim()
    return trimmed === '' || trimmed === '{}'
  } catch {
    return false
  }
}

// Provision per-container Claude Code config: copies the hook script and
// writes a settings.json into the agent's per-UUID dir, with hook paths
// pointing at the container-side mount of that hook script. Also seeds the
// per-agent persistence files (claude-home.json, claude-credentials.json,
// gh-config/) so they exist before docker create — otherwise Docker
// auto-creates them as root-owned dirs at the bind-mount targets, blocking
// the in-container claude user from writing them.
//
// The hook script is snapshotted into the per-UUID dir at create time so
// each cloud agent has a stable, independent copy. To refresh, re-run the
// agent-create flow.
export function provisionCloudClaudeConfig(
  agentId: string,
  hostHome: string = os.homedir(),
  repoRoot: string = process.cwd()
): { settingsPath: string; hookPath: string } {
  const sourceHook = path.join(repoRoot, 'scripts', 'claude-hooks', 'ai-maestro-hook.cjs')
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  fs.mkdirSync(agentDir, { recursive: true })

  const hookPath = path.join(agentDir, 'claude-hook.cjs')
  fs.copyFileSync(sourceHook, hookPath)
  fs.chmodSync(hookPath, 0o755)

  const settingsPath = path.join(agentDir, 'claude-settings.json')
  const containerHook = path.posix.join(
    CONTAINER_HOME, '.aimaestro', 'agents', agentId, 'claude-hook.cjs'
  )
  // Pre-accept the --dangerously-skip-permissions warning prompt for the cloud
  // agent. Without this, claude-code re-shows the "Yes, I accept" warning on
  // EVERY container start when launched with --dangerously-skip-permissions,
  // because the container is treated as a fresh machine and there's no
  // persisted accept state. The accept-state field is `skipDangerousModePermissionPrompt`
  // (verified: 9 occurrences in the claude binary; confirmed by official
  // claude.ai docs guidance for containerized claude). Cloud-agent containers
  // are the documented "isolated environment" use case for bypass-permissions
  // mode — the docs explicitly endorse pre-accepting it for containers.
  // Combined with the RW mount below, this also lets claude write OTHER
  // settings.json keys (allowedTools, model preferences) and have them
  // persist across the container's lifetime.
  const settings = {
    skipDangerousModePermissionPrompt: true,
    hooks: {
      Notification: [
        {
          matcher: 'idle_prompt|permission_prompt',
          hooks: [{ type: 'command', command: `node ${containerHook}`, timeout: 5 }],
        },
      ],
      Stop: [{ hooks: [{ type: 'command', command: `node ${containerHook}`, timeout: 5 }] }],
      SessionStart: [{ hooks: [{ type: 'command', command: `node ${containerHook}`, timeout: 5 }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: `node ${containerHook}`, timeout: 30 }] }],
    },
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 })

  // Seed per-agent persistence files with valid contents. Docker file-level
  // bind mounts require the host source to exist as a file (not a directory)
  // before container create; otherwise Docker materializes the target as a
  // directory and the application errors.
  //
  // claude-home.json (mounts to /home/claude/.claude.json) is seeded with
  // theme="dark" to skip the theme picker on first launch — without it, fresh
  // cloud agents land on the picker and the on-wake hook gets typed into a
  // menu (kanban 41dd54b9). Other claude-home fields are written by claude on
  // first run / login.
  //
  // Shape-aware merge (kanban 406ff85d, sister to PR #112's gemini fix):
  // when migrateAgentPersistence carries forward a predecessor claude-home.json
  // that pre-dates the theme=dark seed (kanban 41dd54b9), the bare existsSync
  // guard short-circuited and the seed never re-applied — Holmes empirical
  // 2026-05-06 (Watson Hale post-recreate finding). Now we read existing
  // contents, inject `theme: "dark"` only if missing, preserve everything
  // else the operator may have set (model preferences, hand-edits).
  // Operator-set theme (any string) is preserved — claude supports multiple
  // themes (dark, light, dark-daltonized, etc.) and operator choice wins.
  const claudeHomePath = path.join(agentDir, 'claude-home.json')
  let claudeHomeNeedWrite = !fs.existsSync(claudeHomePath)
  let claudeHome: Record<string, unknown>
  if (claudeHomeNeedWrite) {
    claudeHome = { theme: 'dark' }
  } else {
    try {
      claudeHome = JSON.parse(fs.readFileSync(claudeHomePath, 'utf8'))
      if (typeof claudeHome.theme !== 'string') {
        // Stale-shape signal: migrated pre-kanban-41dd54b9 claude-home lacks
        // the theme selector. Inject just the missing piece.
        claudeHome = { ...claudeHome, theme: 'dark' }
        claudeHomeNeedWrite = true
      }
    } catch (err) {
      console.warn(
        `[provisionCloudClaudeConfig] unparseable claude-home.json at ${claudeHomePath} — re-seeding from scratch:`,
        err instanceof Error ? err.message : err,
      )
      claudeHome = { theme: 'dark' }
      claudeHomeNeedWrite = true
    }
  }
  if (claudeHomeNeedWrite) {
    fs.writeFileSync(claudeHomePath, JSON.stringify(claudeHome) + '\n', { mode: 0o600 })
  }
  // claude-credentials.json (OAuth tokens) — operator-driven bootstrap
  // (kanban 8aa61a60). At provision time, copy the host operator's
  // ~/.claude/.credentials.json into the per-agent dir, so the fresh agent
  // inherits a valid auth on first launch and skips the browser sign-in
  // dance. Operator runs `claude /login` once on the host, every future
  // cloud-agent create inherits. After bootstrap, each agent's claude
  // rewrites this file on its own refresh cycle — per-agent isolation
  // (independent rotation, isolated revoke radius) is preserved.
  //
  // Falls back to '{}' if the host has no credentials yet (first-time
  // setup case) AND no migrated predecessor file is present.
  //
  // seedFromHostFile fully owns dest-existence semantics (kanban 02a8ebda
  // + Watson Mason post-#104 finding): real rotated creds at dest are
  // preserved, but an empty `{}` placeholder migrated forward from a
  // pre-bootstrap predecessor IS re-seeded from the (now-populated) host
  // source. This restores the post-hoc-host-login → recreate propagation
  // path that the previous outer existsSync guard short-circuited.
  //
  // Shane's preference was "single shared host file mounted into all
  // containers"; chose per-agent-copy override per his explicit invitation
  // to override if isolation makes more sense — same shape as PR #96 +
  // codex-auth.json (kanban 354a5174) for protocol consistency.
  const claudeCredsPath = path.join(agentDir, 'claude-credentials.json')
  if (!seedFromHostFile(path.join(hostHome, '.claude', '.credentials.json'), claudeCredsPath)) {
    if (!fs.existsSync(claudeCredsPath)) {
      fs.writeFileSync(claudeCredsPath, '{}\n', { mode: 0o600 })
    }
  }
  // gh stores config in a directory (config.yml, hosts.yml). Just ensure the
  // dir exists; gh creates its own files on first `gh auth login`.
  const ghConfigDir = path.join(agentDir, 'gh-config')
  fs.mkdirSync(ghConfigDir, { recursive: true, mode: 0o700 })

  return { settingsPath, hookPath }
}

// File-level bind mount that overlays the per-container settings.json onto
// /home/claude/.claude/settings.json without exposing the rest of the host's
// ~/.claude tree. Mount target's parent (/home/claude/.claude) must pre-exist
// in the image as claude-owned — see agent-container/Dockerfile — otherwise
// Docker auto-creates it as root and blocks claude from writing siblings.
//
// RW (was RO before v0.30.37): claude-code writes settings.json on a few
// flows — notably the --dangerously-skip-permissions accept (sets
// skipDangerousModePermissionPrompt) but also allowedTools and model
// preferences. With a RO mount, those writes silently fail and the bypass
// warning re-prompts on every container start. Provisioning seeds
// skipDangerousModePermissionPrompt: true upfront so the prompt never fires
// in the first place; RW lets any subsequent claude writes also persist.
// Per-agent isolation is unchanged — host's own ~/.claude/settings.json is
// never touched.
export function buildCloudClaudeSettingsMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'claude-settings.json'),
    containerPath: path.posix.join(CONTAINER_HOME, '.claude', 'settings.json'),
  }
}

// Provision per-container Gemini CLI config: writes a settings.json into the
// agent's per-UUID dir that suppresses the gemini self-update fetch on
// container start AND pre-selects the operator's OAuth personal auth method.
// The trust-folder dialog is handled separately by the
// GEMINI_CLI_TRUST_WORKSPACE=true env (set in buildAmpCommonEnv) — that path
// is the gemini-supported in-binary fast path that returns isTrusted=true
// without a file lookup, see @google/gemini-cli util/trust.ts checkPathTrust.
//
// Without enableAutoUpdate=false, freshly-recreated gemini cloud agents show
// "✕ Automatic update failed. Please try updating manually." on every cold
// launch (the in-container env can't reach npm to self-update). The error
// itself is non-blocking but adds modal noise above the on-wake prompt and
// confuses operators reading the pane (kanban cd2d7377).
//
// Without security.auth.selectedType="oauth-personal", gemini falls through
// to "Please set an Auth method in your /home/claude/.gemini/settings.json
// or specify one of the following environment variables before running:
// GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA" on every
// launch — even when oauth_creds.json is present. Setting selectedType is
// what tells gemini "use the OAuth path" and consume oauth_creds.json. The
// canonical "oauth-personal" string is verified in @google/gemini-cli
// bundle (8 occurrences across chunk-EA775AOR, chunk-GOUPAQ35, etc.) and
// matches the value the gemini interactive auth-picker writes when an
// operator selects "Login with Google" (kanban 1f911653 Hardin empirical
// 2026-05-01: oauth_creds bootstrap alone was necessary-but-not-sufficient).
//
// Per-agent isolation: the seed file lives under ~/.aimaestro/agents/<id>/,
// bind-mounted RW at /home/claude/.gemini/settings.json by
// buildCloudGeminiSettingsMount. Host operator's ~/.gemini is never touched.
//
// Shape-aware staleness detection (kanban 61aac9db, Watson Mason empirical
// 2026-05-02): on /recreate of a pre-PR-#108 cloud agent, migrateAgentPersistence
// carries the predecessor's stale-shape gemini-settings.json forward into the
// new UUID dir BEFORE this function runs. The previous `if (!existsSync) seed`
// guard saw the file present and short-circuited, leaving the migrated stale
// shape (no security.auth.selectedType) in place. Result: gemini in the
// recreated container fell through to the auth picker even though oauth_creds
// was correctly bootstrapped, because settings.json told gemini "no auth path
// selected". Sister-class to PR #104 empty-{} re-bootstrap but with a
// "missing field within otherwise-valid JSON" signal instead of "empty
// placeholder" — so we minimal-merge (inject just the missing field, preserve
// every other operator hand-edit) rather than full-re-seed. This respects
// PR #102's "preserves existing content across re-runs (operator hand-edit
// intent)" contract.
//
// Unparseable JSON falls through to a fresh seed (same-shape as no-file).
// Logged so production traces capture the rare event if it ever fires.
export function provisionCloudGeminiConfig(
  agentId: string,
  hostHome: string = os.homedir()
): { settingsPath: string } {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  const settingsPath = path.join(agentDir, 'gemini-settings.json')

  let needWrite = !fs.existsSync(settingsPath)
  let settings: Record<string, unknown>
  if (needWrite) {
    settings = {
      general: { enableAutoUpdate: false },
      security: { auth: { selectedType: 'oauth-personal' } },
    }
  } else {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      // Defensive: tolerate operator/legacy garbage where security or
      // security.auth is set to a non-object (string, number, null). Without
      // this, the spread `{...security}` would inline string indices into the
      // result and break gemini's settings reader (Watson polish note).
      const securityRaw = settings.security
      const security: Record<string, unknown> =
        securityRaw && typeof securityRaw === 'object' && !Array.isArray(securityRaw)
          ? (securityRaw as Record<string, unknown>)
          : {}
      const authRaw = security.auth
      const auth: Record<string, unknown> =
        authRaw && typeof authRaw === 'object' && !Array.isArray(authRaw)
          ? (authRaw as Record<string, unknown>)
          : {}
      if (typeof auth.selectedType !== 'string') {
        // Stale-shape signal: migrated pre-PR-#108 settings lacks the auth
        // selector. Inject just the missing piece; preserve everything else
        // the operator may have set (mcp servers, custom keys, hand-edits).
        // Operator-set selectedType (any string) is preserved — gemini supports
        // multiple AuthType values besides "oauth-personal" (gemini-api-key,
        // vertex-ai, cloud-shell, LOGIN_WITH_GOOGLE) and operator choice wins.
        settings.security = { ...security, auth: { ...auth, selectedType: 'oauth-personal' } }
        needWrite = true
      }
    } catch (err) {
      console.warn(
        `[provisionCloudGeminiConfig] unparseable settings.json at ${settingsPath} — re-seeding from scratch:`,
        err instanceof Error ? err.message : err,
      )
      settings = {
        general: { enableAutoUpdate: false },
        security: { auth: { selectedType: 'oauth-personal' } },
      }
      needWrite = true
    }
  }
  if (needWrite) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
  }
  return { settingsPath }
}

// File-level bind mount for the per-agent gemini settings.json. Mount target
// parent (/home/claude/.gemini) must pre-exist in the image as claude-owned
// — see agent-container/Dockerfile — otherwise Docker auto-creates it as
// root and blocks gemini from writing siblings (history, sessions, oauth).
//
// RW: gemini may write back to settings.json on /settings UI flows. Per-agent
// isolation is unchanged — host's own ~/.gemini/settings.json is never touched.
// Mount is harmless for non-gemini programs (claude/codex ignore the path).
export function buildCloudGeminiSettingsMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'gemini-settings.json'),
    containerPath: path.posix.join(CONTAINER_HOME, '.gemini', 'settings.json'),
  }
}

// Provision per-container Codex CLI config: writes a version.json + a
// config.toml into the agent's per-UUID dir to suppress two distinct
// first-launch blockers:
//
// 1. version.json — pre-dismisses the "Update available!" modal that codex
//    auto-checks on every interactive launch. Without this seed, the modal
//    eats the head of the on-wake hook (verified on R2D2 2026-04-30 after
//    codex 0.128.0 dropped — first 25 chars silently consumed; kanban
//    22f4af86). FIRST_RUN_MODAL_PATTERN doesn't match codex Update-available.
//    Strategy: dismissed_version sentinel "999.0.0" + last_checked_at far in
//    the future. Suppresses re-check loops indefinitely until codex tags
//    >= 999.0.0 (then bump this seed).
//
// 2. config.toml — pre-trusts /workspace so codex skips its
//    "Do you trust the contents of this directory?" modal on first launch
//    (kanban 354a5174 trust-modal sibling, surfaced empirically tonight).
//    /workspace is the per-agent operator-declared working directory —
//    cloud agents are sandboxed to that mount only, so trust is the safe
//    default. Codex's config.toml schema accepts per-project trust_level
//    blocks; "trusted" is the documented value.
//
// Per-agent isolation: both files live under ~/.aimaestro/agents/<id>/,
// bind-mounted RW at /home/claude/.codex/version.json + config.toml by
// the corresponding mount builders. Host operator's ~/.codex is never
// touched.
export function provisionCloudCodexConfig(
  agentId: string,
  hostHome: string = os.homedir()
): { versionPath: string; configTomlPath: string } {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  const versionPath = path.join(agentDir, 'codex-version.json')
  if (!fs.existsSync(versionPath)) {
    const versionState = {
      latest_version: '999.0.0',
      last_checked_at: '2099-01-01T00:00:00.000Z',
      dismissed_version: '999.0.0',
    }
    fs.writeFileSync(versionPath, JSON.stringify(versionState) + '\n', { mode: 0o600 })
  }
  const configTomlPath = path.join(agentDir, 'codex-config.toml')
  if (!fs.existsSync(configTomlPath)) {
    const configToml =
      '[projects."/workspace"]\n' +
      'trust_level = "trusted"\n'
    fs.writeFileSync(configTomlPath, configToml, { mode: 0o600 })
  }
  return { versionPath, configTomlPath }
}

// File-level bind mount for the per-agent codex config.toml. Mount target
// parent (/home/claude/.codex) is pre-created in agent-container/Dockerfile.
//
// RW: codex rewrites config.toml when the operator runs /config or similar
// in-CLI commands. Per-agent isolation unchanged.
export function buildCloudCodexConfigTomlMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'codex-config.toml'),
    containerPath: path.posix.join(CONTAINER_HOME, '.codex', 'config.toml'),
  }
}

// File-level bind mount for the per-agent codex version.json. Mount target
// parent (/home/claude/.codex) must pre-exist in the image as claude-owned
// — see agent-container/Dockerfile — otherwise Docker auto-creates it as
// root and blocks codex from writing siblings (auth, sessions, history).
//
// RW: codex rewrites version.json on every update-check refresh. Per-agent
// isolation unchanged. Mount is harmless for non-codex programs.
export function buildCloudCodexVersionMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'codex-version.json'),
    containerPath: path.posix.join(CONTAINER_HOME, '.codex', 'version.json'),
  }
}

// Provision per-container Codex CLI auth: at agent-create time, copy the
// host operator's ~/.codex/auth.json into the per-agent dir so the fresh
// cloud agent inherits a valid OpenAI/ChatGPT login and skips the
// "Welcome to Codex / Sign in" picker on first launch (kanban 354a5174,
// Option A operator-driven Device Code per Shane 2026-05-01).
//
// Operator workflow: run `codex login` once on the host, every subsequent
// cloud-agent create inherits the credentials. Codex rewrites auth.json on
// its own refresh cycle (token rotation, re-login), and those writes go to
// the per-agent file via the bind mount — never back to the host source —
// so per-agent rotation is independent + revoke radius is per-agent.
//
// If the host has no auth.json yet (first-time setup) AND no migrated
// predecessor file is present, seed empty {}. Codex will then show its
// sign-in picker on first launch in the container, matching pre-PR
// behavior. seedFromHostFile fully owns dest-existence semantics — see
// the function docstring for the empty-{}-re-seed contract that lets
// post-hoc host login propagate via /recreate (Watson Mason post-#104
// finding, kanban 02a8ebda follow-up).
export function provisionCloudCodexAuth(
  agentId: string,
  hostHome: string = os.homedir()
): { authPath: string; bootstrapped: boolean } {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  const authPath = path.join(agentDir, 'codex-auth.json')
  const bootstrapped = seedFromHostFile(
    path.join(hostHome, '.codex', 'auth.json'),
    authPath,
  )
  if (!bootstrapped && !fs.existsSync(authPath)) {
    fs.writeFileSync(authPath, '{}\n', { mode: 0o600 })
  }
  return { authPath, bootstrapped }
}

// File-level bind mount for the per-agent codex auth.json. Mount target
// parent (/home/claude/.codex) is pre-created in agent-container/Dockerfile
// alongside the .gemini sibling.
//
// RW: codex writes auth.json on token refresh + re-login. Per-agent
// isolation unchanged — host operator's ~/.codex/auth.json is read at
// provision time and never touched again.
export function buildCloudCodexAuthMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'codex-auth.json'),
    containerPath: path.posix.join(CONTAINER_HOME, '.codex', 'auth.json'),
  }
}

// Provision per-container Gemini CLI auth: at agent-create time, copy the
// host operator's ~/.gemini/oauth_creds.json into the per-agent dir so the
// fresh cloud agent inherits a valid Google OAuth login and skips the
// "Please set an Auth method" picker on first launch (kanban 1f911653,
// sibling to PR #103 codex Device Code + claude OAuth — three programs,
// one Option A operator-driven shape).
//
// Operator workflow: run `gemini` once on the host and complete the OAuth
// flow, every subsequent cloud-agent create inherits the credentials.
// Gemini rewrites oauth_creds.json on its own refresh cycle (token
// rotation, re-login), and those writes go to the per-agent file via the
// bind mount — never back to the host source — so per-agent rotation is
// independent + revoke radius is per-agent.
//
// If the host has no oauth_creds.json yet (first-time setup) AND no
// migrated predecessor file is present, seed empty {}. Gemini will then
// show its auth picker on first launch in the container, matching pre-PR
// behavior. seedFromHostFile fully owns dest-existence semantics — see
// the function docstring for the empty-{}-re-seed contract that lets
// post-hoc host login propagate via /recreate (kanban 02a8ebda
// + Watson Mason finding from PR #105).
//
// Refresh-token tradeoff: same as codex-auth + claude-credentials — once
// the per-agent copy diverges from the host source via in-container
// rotation, host refresh-token rotations no longer propagate (the per-
// agent file is now the live source). Accepted as the consistent shape
// across all three programs; revoke is per-agent.
export function provisionCloudGeminiAuth(
  agentId: string,
  hostHome: string = os.homedir()
): { authPath: string; bootstrapped: boolean } {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  const authPath = path.join(agentDir, 'gemini-oauth-creds.json')
  const bootstrapped = seedFromHostFile(
    path.join(hostHome, '.gemini', 'oauth_creds.json'),
    authPath,
  )
  if (!bootstrapped && !fs.existsSync(authPath)) {
    fs.writeFileSync(authPath, '{}\n', { mode: 0o600 })
  }
  return { authPath, bootstrapped }
}

// File-level bind mount for the per-agent gemini oauth_creds.json. Mount
// target parent (/home/claude/.gemini) is pre-created in agent-container/
// Dockerfile alongside the .codex sibling.
//
// RW: gemini writes oauth_creds.json on token refresh + re-login. Per-
// agent isolation unchanged — host operator's ~/.gemini/oauth_creds.json
// is read at provision time and never touched again.
export function buildCloudGeminiOAuthMount(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount {
  return {
    hostPath: path.join(hostHome, '.aimaestro', 'agents', agentId, 'gemini-oauth-creds.json'),
    containerPath: path.posix.join(CONTAINER_HOME, '.gemini', 'oauth_creds.json'),
  }
}

// Migrate per-agent persisted claude/gh state from a predecessor UUID dir to
// a new agent's dir. Used by recreateDockerAgent to bridge the UUID rotation:
// /recreate soft-deletes the old agent (rotating to a fresh UUID per audit-
// trail policy) and the new container's bind mounts point at the new UUID's
// dir, which would otherwise start empty. Copying the persistence assets
// across before container start preserves bypass-accept, claude OAuth, and
// gh auth across recreates.
//
// Best-effort: missing source files are skipped (predecessor was created
// before this feature shipped, or the operator never logged in). Failures
// are logged, not thrown — recreate must still succeed even if migration
// can't run cleanly. provisionCloudClaudeConfig's existsSync guards then
// no-op on the migrated files so claude/gh see the preserved state.
export function migrateAgentPersistence(
  fromAgentId: string,
  toAgentId: string,
  hostHome: string = os.homedir()
): void {
  if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) return
  const fromDir = path.join(hostHome, '.aimaestro', 'agents', fromAgentId)
  const toDir = path.join(hostHome, '.aimaestro', 'agents', toAgentId)
  if (!fs.existsSync(fromDir)) return
  fs.mkdirSync(toDir, { recursive: true })

  const fileAssets = [
    'claude-home.json',
    'claude-credentials.json',
    // Gemini settings (general.enableAutoUpdate=false seed) — survive recreate
    // so operator hand-edits to ~/.gemini/settings.json carry forward.
    'gemini-settings.json',
    // Codex version.json (dismissed_version sentinel) — survive recreate so
    // a per-agent override of the sentinel carries forward.
    'codex-version.json',
    // Codex auth.json (kanban 354a5174 Option A operator-driven Device Code)
    // — survive recreate so codex stays logged in across UUID rotation.
    // Mirrors the claude-credentials.json carry-forward behavior from PR #96.
    'codex-auth.json',
    // Codex config.toml (per-project trust_level + future config flags)
    // — survive recreate so /workspace stays trusted across UUID rotation
    // and any operator /config edits inside the running agent persist.
    'codex-config.toml',
    // Gemini oauth_creds.json (kanban 1f911653 Option A operator-driven OAuth)
    // — survive recreate so gemini stays logged in across UUID rotation.
    // Mirrors codex-auth.json + claude-credentials.json carry-forward shape.
    'gemini-oauth-creds.json',
  ]
  for (const name of fileAssets) {
    const src = path.join(fromDir, name)
    const dst = path.join(toDir, name)
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
        fs.chmodSync(dst, 0o600)
      }
    } catch (err) {
      console.warn(`[migrateAgentPersistence] copy ${name}:`, err instanceof Error ? err.message : err)
    }
  }

  // Directory assets carried forward recursively. Each is a per-agent host
  // dir bind-mounted into the container (see buildCloudClaudePersistMounts +
  // buildCloudClaudeReadthroughMounts). Without these, /recreate with
  // persistFromAgentId destroys: gh-config (config.yml + hosts.yml + any
  // extensions/); claude-projects (Claude Code conversation JSONL — chat
  // history would reset to empty on every recreate); chat-state (ai-maestro
  // hook output — permission-prompts + pending-state pinned by the most
  // recent hook write would reset to empty on every recreate).
  const dirAssets = [
    'gh-config',
    // PR #130 (kanban 2853e62d) added these as per-agent bind-mount sources
    // exposed back through to the host. Migrate forward so chat-history +
    // hook-state survive UUID rotation, mirroring the claude-credentials /
    // claude-home / gh-config carry-forward semantics on the file side.
    'claude-projects',
    'chat-state',
    // PR #132 (kanban d937c33d) sister mount for cloud-Gemini transcript;
    // same survival-on-recreate semantic as claude-projects but for the
    // ~/.gemini/tmp/<project>/chats/ bind-mount source.
    'gemini-chats',
  ]
  for (const name of dirAssets) {
    const src = path.join(fromDir, name)
    const dst = path.join(toDir, name)
    try {
      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dst, { recursive: true })
      }
    } catch (err) {
      console.warn(`[migrateAgentPersistence] copy ${name}:`, err instanceof Error ? err.message : err)
    }
  }
}

// Per-agent state-persistence mounts that survive /recreate. Without these,
// every cloud-agent recreate destroys:
//   - ~/.claude.json (bypass-permissions accept flag, onboarding state,
//     project-keyed cache, oauthAccount metadata) — forces the operator
//     through the "Yes, I accept" prompt every single recreate, which is
//     incompatible with --dangerously-skip-permissions autonomous agents.
//   - ~/.claude/.credentials.json (claude-code OAuth tokens) — forces the
//     login URL → browser → paste-code dance every recreate.
//   - ~/.config/gh (gh CLI auth) — forces `gh auth login` every recreate.
//
// Each is mounted RW from a per-agent dir under ~/.aimaestro/agents/<id>/,
// isolated from host operator state and from other agents on the host.
// Provisioned in provisionCloudClaudeConfig so docker-create finds files
// (not auto-materialized root-owned directories) at the bind targets.
//
// Compatible with non-claude programs (gemini, codex): the mounts overlay
// claude-specific paths; gemini/codex ignore them. Codex has its own
// per-agent state under ~/.codex which a follow-up pass can persist using
// the same pattern (filed as a kanban candidate).
export function buildCloudClaudePersistMounts(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount[] {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  return [
    {
      hostPath: path.join(agentDir, 'claude-home.json'),
      containerPath: path.posix.join(CONTAINER_HOME, '.claude.json'),
    },
    {
      hostPath: path.join(agentDir, 'claude-credentials.json'),
      containerPath: path.posix.join(CONTAINER_HOME, '.claude', '.credentials.json'),
    },
    {
      hostPath: path.join(agentDir, 'gh-config'),
      containerPath: path.posix.join(CONTAINER_HOME, '.config', 'gh'),
    },
  ]
}

// Directory mounts that expose in-container Claude state (conversation JSONL
// + ai-maestro hook chat-state) back through to the host fs so the maestro
// server can read them with plain fs.readFileSync. Without these, the chat
// panel renders empty for cloud agents because getConversationMessages reads
// the operator's host ~/.claude/projects/ which has no record of the
// in-container Claude run. Per-agent isolation — each cloud agent gets its
// own host-side dir. mkdir-pre-create ensures docker does not auto-create
// a root-owned dir that the in-container claude (uid 1000) cannot write to.
export function buildCloudClaudeReadthroughMounts(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount[] {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  return [
    {
      hostPath: path.join(agentDir, 'claude-projects'),
      containerPath: path.posix.join(CONTAINER_HOME, '.claude', 'projects'),
    },
    {
      hostPath: path.join(agentDir, 'chat-state'),
      containerPath: path.posix.join(CONTAINER_HOME, '.aimaestro', 'chat-state'),
    },
  ]
}

// Sister-of buildCloudClaudeReadthroughMounts for cloud-Gemini agents.
// Gemini CLI writes conversation JSONL to ~/.gemini/tmp/<project>/chats/
// where <project> is the value from ~/.gemini/projects.json keyed by cwd
// (CONTAINER_CWD_GEMINI_PROJECT = "workspace" for the standard /workspace
// bind). Empirically pinned via Holmes Mason/Optic 2026-05-11 (kanban
// d937c33d). Applied to ALL cloud agents regardless of program — the mount
// is harmless for non-Gemini agents (claude/codex never write under
// .gemini/tmp/), keeping the mount-set shape uniform.
export function buildCloudGeminiReadthroughMounts(
  agentId: string,
  hostHome: string = os.homedir()
): SandboxMount[] {
  const agentDir = path.join(hostHome, '.aimaestro', 'agents', agentId)
  return [
    {
      hostPath: path.join(agentDir, 'gemini-chats'),
      containerPath: path.posix.join(
        CONTAINER_HOME,
        '.gemini',
        'tmp',
        CONTAINER_CWD_GEMINI_PROJECT,
        'chats',
      ),
    },
  ]
}

// Container PATH that puts the AMP CLI (mounted at /home/claude/.local/bin)
// + the repo-script CLI dir (meeting-send / meeting-task / meeting-read,
// mounted at /home/claude/.local/share/aimaestro/cli) ahead of the standard
// Debian path. The base image's Dockerfile sets only the standard path, so
// without this override `which amp-send` and `which meeting-task.sh` fail
// inside the container even though the binaries are mounted and work by full
// path. The cli/ entry was added 2026-05-06 alongside the matching
// scripts-dir bind mount in buildAmpCommonMounts (kanban 0d80aed7).
const CONTAINER_PATH = `${CONTAINER_HOME}/.local/bin:${CONTAINER_HOME}/.local/share/aimaestro/cli:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`

// AMP common envs tell amp-helper.sh exactly which agent identity dir to use
// (priority 1 of its resolution order) and where to reach the AI Maestro server
// from inside the container (host.docker.internal is added via --add-host).
//
// Without these, amp-helper falls through to its name-based fallback, which
// auto-creates a phantom empty identity, and amp-send tries to call the
// container's own loopback agent-server instead of the AI Maestro API.
//
// CLAUDE_AGENT_NAME backs amp-helper's priority-3 resolution path — set
// alongside CLAUDE_AGENT_ID so name-based lookups (sender name in routed
// messages, index lookups) get the same answer as id-based lookups.
export function buildAmpCommonEnv(agentId: string, agentName: string, hostUrl: string): Record<string, string> {
  return {
    CLAUDE_AGENT_ID: agentId,
    CLAUDE_AGENT_NAME: agentName,
    AMP_DIR: path.posix.join(CONTAINER_HOME, '.agent-messaging', 'agents', agentId),
    AMP_MAESTRO_URL: hostUrl,
    PATH: CONTAINER_PATH,
    // Pre-trust the workspace for gemini-program agents — bypasses the trust
    // dialog (kanban cd2d7377) without needing a trustedFolders.json mount.
    // Honored by gemini's util/trust.ts checkPathTrust before the file lookup.
    // Harmless for non-gemini programs (claude/codex don't read this var).
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
  }
}

// Merge mounts so operator-supplied entries override common ones at the same
// containerPath (operator wins), preserving operator order then appending any
// common mount the operator did not already cover.
export function mergeMounts(common: SandboxMount[], operator: SandboxMount[] | undefined): SandboxMount[] {
  const operatorList = operator ?? []
  const operatorPaths = new Set(operatorList.map(m => m.containerPath))
  return [...operatorList, ...common.filter(m => !operatorPaths.has(m.containerPath))]
}

// Merge envs so operator-supplied entries override common ones for the same key.
export function mergeEnv(common: Record<string, string>, operator: Record<string, string> | undefined): Record<string, string> {
  return { ...common, ...(operator ?? {}) }
}

// Bootstrap an AMP identity for a freshly-created cloud agent: generate the
// keypair, register with the local AI Maestro AMP server (issues the API key),
// and write the keypair + config + IDENTITY.md + provider registration file
// into the agent's per-UUID dir so the bind mount lands populated.
//
// Without this, brand-new cloud agents have an empty per-UUID dir (the bind-
// mount target exists but contains no keys/registrations/config), and the
// container's amp-* CLI cannot sign outbound messages until amp-init runs
// from inside — which fails today because the agent's per-UUID mount sits
// under a root-owned parent (/home/claude/.agent-messaging/agents/), so amp-
// init's mkdir for a new sibling UUID hits EPERM. See PR #79 for the per-
// agent mount tradeoff and the meeting thread for the discovery.
//
// Tree mismatch caveat: lib/amp-keys.ts saveKeyPair writes to
// ~/.aimaestro/agents/<id>/keys/ (the registry/runtime side, used by the
// SERVER to verify the public key), but amp-helper inside the container
// reads from ~/.agent-messaging/agents/<id>/keys/ (the messaging side,
// where amp-init traditionally writes). Bootstrap writes to BOTH: saveKeyPair
// for server-side public-key storage + direct write to the messaging side
// for the agent's own signing keys. registerAgent's internal saveKeyPair
// call (with empty private) is also overwritten by our saveKeyPair call to
// keep the registry-side store correct.
//
// Failures are logged loudly but non-fatal — the container is already
// running by the time we get here, the agent can use its program normally,
// only AMP signing is unavailable until an operator amp-init runs manually.
export async function bootstrapAmpIdentity(
  agentId: string,
  agentName: string,
  hostHome: string = os.homedir()
): Promise<void> {
  const tenant = getOrganization()
  if (!tenant) {
    console.warn('[Docker Service] Skipping AMP bootstrap — organization not configured. Run setup or amp-init manually after the agent boots.')
    return
  }

  const keyPair = await generateKeyPair()

  // registerAgent adopts the existing agent record (we just created it with
  // this UUID), issues an API key, marks the agent AMP-registered, and calls
  // initAgentAMPHome to set up the messaging-side dir + .index.json entry.
  // It also calls saveKeyPair internally with an EMPTY private — we re-save
  // with the real private after to overwrite the registry-side store.
  const regResult = await registerAgent(
    {
      name: agentName,
      tenant,
      public_key: keyPair.publicPem,
      key_algorithm: 'Ed25519',
      agent_id: agentId,
    },
    null
  )

  if (regResult.status !== 200 && regResult.status !== 201) {
    const errMsg = (regResult.data as { message?: string })?.message || 'Unknown registration error'
    console.warn(`[Docker Service] AMP registration failed (HTTP ${regResult.status}): ${errMsg}. Container will still run; AMP signing unavailable until operator amp-init.`)
    return
  }

  // Server-side store: overwrite the empty private from registerAgent's
  // saveKeyPair call so the registry-side keys/ dir holds real bytes
  // (used by the server for fingerprint verification on inbound).
  saveKeyPair(agentId, keyPair)

  const regResp = regResult.data as {
    address: string
    agent_id: string
    api_key: string
    provider: { name: string; endpoint: string; route_url: string }
    tenant: string
  }

  // Messaging-side per-UUID dir is the path amp-helper inside the container
  // reads from. Write keys, config.json (overriding initAgentAMPHome's
  // minimal stub which inherits machine-level "default" tenant), IDENTITY.md,
  // and the provider registration file.
  const agentMessagingDir = path.join(hostHome, '.agent-messaging', 'agents', agentId)
  const keysDir = path.join(agentMessagingDir, 'keys')
  const regsDir = path.join(agentMessagingDir, 'registrations')
  fs.mkdirSync(keysDir, { recursive: true })
  fs.mkdirSync(regsDir, { recursive: true })

  // Keys — match amp-init's mode bits (private 0600, public 0644)
  fs.writeFileSync(path.join(keysDir, 'private.pem'), keyPair.privatePem, { mode: 0o600 })
  fs.writeFileSync(path.join(keysDir, 'public.pem'), keyPair.publicPem, { mode: 0o644 })

  // config.json — rewrite with real tenant + address + fingerprint from the
  // registration response. initAgentAMPHome wrote a stub with "default"
  // tenant copied from the machine-level config; that mismatch causes
  // amp-identity to misreport the agent's own address.
  const configBody = {
    version: '1.1',
    agent: {
      name: agentName,
      tenant: regResp.tenant,
      address: regResp.address,
      fingerprint: keyPair.fingerprint,
      createdAt: new Date().toISOString(),
      id: agentId,
    },
    provider: {
      domain: regResp.provider.name,
      maestro_url: 'http://host.docker.internal:23000',
    },
  }
  fs.writeFileSync(path.join(agentMessagingDir, 'config.json'), JSON.stringify(configBody, null, 2), { mode: 0o644 })

  // IDENTITY.md — markdown card amp-identity references for context recovery
  const identityBody =
    `# Agent Messaging Protocol (AMP) Identity\n\n` +
    `This agent is configured for inter-agent messaging using AMP.\n\n` +
    `## Core Identity\n\n` +
    `| Field | Value |\n` +
    `|-------|-------|\n` +
    `| **Name** | ${agentName} |\n` +
    `| **Tenant** | ${regResp.tenant} |\n` +
    `| **Address** | ${regResp.address} |\n` +
    `| **Fingerprint** | ${keyPair.fingerprint} |\n` +
    `| **UUID** | ${agentId} |\n\n` +
    `Bootstrapped server-side at create-time by ai-maestro createDockerAgent.\n`
  fs.writeFileSync(path.join(agentMessagingDir, 'IDENTITY.md'), identityBody, { mode: 0o644 })

  // Provider registration file — amp-helper looks here for the API key +
  // route URL when sending outbound.
  const regFilePath = path.join(regsDir, `${regResp.provider.name}.json`)
  const regFileBody = {
    provider: regResp.provider.name,
    apiUrl: regResp.provider.endpoint,
    routeUrl: regResp.provider.route_url,
    agentName,
    tenant: regResp.tenant,
    address: regResp.address,
    apiKey: regResp.api_key,
    providerAgentId: regResp.agent_id,
    fingerprint: keyPair.fingerprint,
    registeredAt: new Date().toISOString(),
  }
  fs.writeFileSync(regFilePath, JSON.stringify(regFileBody, null, 2), { mode: 0o600 })

  console.log(`[Docker Service] Bootstrapped AMP identity for ${agentName} (${agentId.substring(0, 8)}...)`)
}

// ── Public Functions ────────────────────────────────────────────────────────


/**
 * Create a new agent running inside a Docker container.
 */
export async function createDockerAgent(body: DockerCreateRequest): Promise<ServiceResult<Record<string, unknown>>> {
  if (!body.name?.trim()) {
    return missingField('name')
  }

  const mountError = validateMounts(body.mounts)
  if (mountError) {
    return invalidRequest(mountError)
  }

  const envError = validateExtraEnv(body.extraEnv)
  if (envError) {
    return invalidRequest(envError)
  }

  const name = body.name.trim().toLowerCase()

  // If targeting a remote host, forward the request
  if (body.hostId) {
    const hosts = getHosts()
    const targetHost = hosts.find(h => h.id === body.hostId)
    if (targetHost && !isSelf(targetHost.id)) {
      try {
        const resp = await fetch(`${targetHost.url}/api/agents/docker/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        })
        const data = await resp.json()
        return { data, status: resp.status }
      } catch (err) {
        return operationFailed('reach remote host', err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }

  // Verify Docker is available
  try {
    await execAsync("docker version --format '{{.Server.Version}}'", { timeout: 5000 })
  } catch {
    return invalidRequest('Docker is not available on this host')
  }

  // Find an available port in 23001-23100 range
  let port: number | null = null
  try {
    const { stdout: portsOutput } = await execAsync(
      "docker ps --format '{{.Ports}}' 2>/dev/null || echo ''"
    )
    const usedPorts = new Set<number>()
    const portRegex = /(\d+)->23000/g
    let match
    while ((match = portRegex.exec(portsOutput)) !== null) {
      usedPorts.add(parseInt(match[1], 10))
    }

    for (let p = 23001; p <= 23100; p++) {
      if (!usedPorts.has(p)) {
        port = p
        break
      }
    }
  } catch {
    port = 23001
  }

  if (!port) {
    return serviceError('operation_failed', 'No available ports in range 23001-23100', 503)
  }

  // Build the AI_TOOL environment variable
  const aiTool = buildAiToolCommand(body)
  const program = body.program || 'claude'

  const containerName = `aim-${name}`
  const workDir = body.workingDirectory || '/tmp'
  const cpus = body.cpus || 2
  const memory = body.memory || '4g'

  // Pre-generate the agent UUID so AMP common mounts and CLAUDE_AGENT_ID can
  // reference it on first container start. createAgent below accepts an
  // explicit `id` and will use it verbatim if it matches the UUID shape.
  const agentId = uuidv4()

  // Build the docker invocation. Common AMP mounts/envs are auto-included for
  // every cloud agent so amp-helper can resolve identity (CLAUDE_AGENT_ID +
  // AMP_DIR) and reach the host AI Maestro server (AMP_MAESTRO_URL via the
  // host.docker.internal alias). Operator-supplied mounts/extraEnv merge on
  // top: same containerPath / same env key wins for the operator, so callers
  // can override defaults when needed.
  const hostPort = process.env.PORT || '23000'
  const hostInternalUrl = `http://host.docker.internal:${hostPort}`

  const baseEnv: Record<string, string> = {
    TMUX_SESSION_NAME: name,
    AI_TOOL: aiTool,
    AGENT_ID: name,
    AIMAESTRO_HOST_URL: hostInternalUrl,
  }
  if (body.githubToken) {
    baseEnv.GITHUB_TOKEN = body.githubToken
  }
  const ampEnv = buildAmpCommonEnv(agentId, name, hostInternalUrl)
  const mergedEnv = mergeEnv({ ...baseEnv, ...ampEnv }, body.extraEnv)

  const ampMounts = buildAmpCommonMounts(agentId)
  const claudeReadthroughMounts = buildCloudClaudeReadthroughMounts(agentId)
  const geminiReadthroughMounts = buildCloudGeminiReadthroughMounts(agentId)

  // Pre-create host-side dirs that are about to be bind-mounted. If the host
  // path doesn't exist, docker creates it as a root-owned empty directory,
  // which (a) leaves the container's claude (uid 1000) unable to write keys
  // and (b) silently masks the missing-identity failure. We create them as the
  // server process user (uid matches the container's claude user by convention).
  for (const m of [...ampMounts, ...claudeReadthroughMounts, ...geminiReadthroughMounts]) {
    try {
      fs.mkdirSync(m.hostPath, { recursive: true })
    } catch (err) {
      console.warn(`[Docker Service] Could not pre-create mount source ${m.hostPath}:`, err)
    }
  }

  // If this create is the back half of a recreate flow, copy the predecessor's
  // persisted claude/gh state into the new UUID dir BEFORE provisioning runs
  // so the empty-{} seeds in provisionCloudClaudeConfig no-op (they only
  // create when missing). Net effect: bypass-accept, claude OAuth, and gh
  // auth all carry across recreates despite the audit-trail UUID rotation.
  if (body.persistFromAgentId) {
    try {
      migrateAgentPersistence(body.persistFromAgentId, agentId)
    } catch (err) {
      console.warn(
        '[Docker Service] persistence migration failed (non-fatal — new agent will start with empty state):',
        err instanceof Error ? err.message : err
      )
    }
  }

  // Provision per-container Claude/Gemini/Codex CLI configs in the agent's
  // per-UUID dir, then add file-level bind mounts that overlay the program-
  // specific config paths inside the container without leaking the host
  // operator's full state tree. Each program's seed + mount runs unconditionally
  // — mounts targeting unused programs are harmless because the other CLIs
  // never read those paths. Provisioning is wrapped per-program so a failure
  // in one (e.g. disk full at the gemini seed) doesn't drop the others.
  try {
    provisionCloudClaudeConfig(agentId)
  } catch (err) {
    console.warn('[Docker Service] Could not provision cloud claude config:', err instanceof Error ? err.message : err)
  }
  try {
    provisionCloudGeminiConfig(agentId)
  } catch (err) {
    console.warn('[Docker Service] Could not provision cloud gemini config:', err instanceof Error ? err.message : err)
  }
  try {
    provisionCloudGeminiAuth(agentId)
  } catch (err) {
    console.warn('[Docker Service] Could not provision cloud gemini auth:', err instanceof Error ? err.message : err)
  }
  try {
    provisionCloudCodexConfig(agentId)
  } catch (err) {
    console.warn('[Docker Service] Could not provision cloud codex config:', err instanceof Error ? err.message : err)
  }
  try {
    provisionCloudCodexAuth(agentId)
  } catch (err) {
    console.warn('[Docker Service] Could not provision cloud codex auth:', err instanceof Error ? err.message : err)
  }
  const mergedMounts = mergeMounts(
    [
      ...ampMounts,
      buildCloudClaudeSettingsMount(agentId),
      ...buildCloudClaudePersistMounts(agentId),
      ...claudeReadthroughMounts,
      buildCloudGeminiSettingsMount(agentId),
      buildCloudGeminiOAuthMount(agentId),
      ...geminiReadthroughMounts,
      buildCloudCodexVersionMount(agentId),
      buildCloudCodexAuthMount(agentId),
      buildCloudCodexConfigTomlMount(agentId),
    ],
    body.mounts
  )

  const dockerCmd = [
    'docker run -d',
    `--name "${containerName}"`,
    '--add-host=host.docker.internal:host-gateway',
    body.autoRemove ? '' : '--restart unless-stopped',
    ...buildEnvFlags(mergedEnv),
    `-v "${workDir}:/workspace"`,
    ...buildMountFlags(mergedMounts),
    `-p ${port}:23000`,
    `--cpus=${cpus}`,
    `--memory=${memory}`,
    body.autoRemove ? '--rm' : '',
    'ai-maestro-agent:latest',
  ].filter(Boolean).join(' ')

  let containerId: string
  try {
    const { stdout } = await execAsync(dockerCmd, { timeout: 30000 })
    containerId = stdout.trim().slice(0, 12)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return operationFailed('start container', message)
  }

  // Register in agent registry. Persist only the operator-supplied mounts
  // under deployment.sandbox.mounts — AMP common mounts are recomputed
  // deterministically from the agent UUID at any future redeploy, so storing
  // them would create drift if defaults evolve.
  try {
    const agent = createAgent({
      id: agentId,
      name,
      label: body.label,
      avatar: body.avatar,
      program,
      model: body.model,
      programArgs: body.programArgs,
      taskDescription: body.prompt || '',
      workingDirectory: workDir,
      runtime: 'docker',
      createSession: true,
      deploymentType: 'cloud',
      hostId: body.hostId,
    })

    const agents = loadAgents()
    const idx = agents.findIndex(a => a.id === agent.id)
    if (idx !== -1) {
      agents[idx].deployment = {
        type: 'cloud',
        cloud: {
          provider: 'local-container',
          containerName,
          websocketUrl: `ws://localhost:${port}/term`,
          healthCheckUrl: `http://localhost:${port}/health`,
          status: 'running',
        },
        ...(body.mounts && body.mounts.length > 0
          ? { sandbox: { mounts: body.mounts } }
          : {}),
      }
      saveAgents(agents)
    }
  } catch (err) {
    console.error('[Docker Service] Registry error:', err)
  }

  // Bootstrap AMP identity server-side so the per-UUID bind mount lands
  // populated with keys + registration. Non-fatal — container is already up.
  try {
    await bootstrapAmpIdentity(agentId, name)
  } catch (err) {
    console.warn('[Docker Service] AMP bootstrap threw:', err instanceof Error ? err.message : err)
  }

  return {
    data: {
      success: true,
      agentId,
      containerId,
      port,
      containerName,
    },
    status: 200
  }
}

/**
 * Build a DockerCreateRequest body from an existing agent's persisted
 * registry fields. Used by recreateDockerAgent to forward all create-time
 * config (programArgs, model, mounts, label, avatar, working directory)
 * to the new container so hibernate→wake-stable AI_TOOL contains everything
 * that was originally specified. Exported for unit testing of the field
 * mapping.
 *
 * Container-derived fields (containerName/port/websocketUrl) deliberately
 * NOT included — they regenerate inside createDockerAgent.
 */
export function buildRecreateBody(oldAgent: Agent): DockerCreateRequest {
  return {
    name: oldAgent.name,
    label: oldAgent.label,
    avatar: oldAgent.avatar,
    hostId: oldAgent.hostId,
    program: oldAgent.program,
    programArgs: oldAgent.programArgs,
    model: oldAgent.model,
    workingDirectory: oldAgent.workingDirectory,
    mounts: oldAgent.deployment?.sandbox?.mounts,
  }
}

// Fields that live on the agent record but are NOT part of DockerCreateRequest.
// After createDockerAgent provisions the new container/registry entry, recreate
// patches these onto the new agent so post-create config (hooks, tags, role, etc.)
// survives the swap. Keep in sync with types/agent.ts Agent interface — fields
// derived from container state (containerName/port/websocketUrl, ampIdentity,
// sessions, status, createdAt, lastActive, deployment) are intentionally NOT
// preserved; they re-derive at create time.
export const RECREATE_PRESERVED_FIELDS = [
  'hooks',
  'taskDescription',
  'tags',
  'capabilities',
  'role',
  'team',
  'documentation',
  'metadata',
  'skills',
  'preferences',
  'meshAware',
  'owner',
  'permissionMode',
] as const

/**
 * Recreate an existing cloud agent: stop+remove its container, soft-delete
 * the old registry entry, and provision a new container with all originally-
 * persisted config preserved (programArgs, model, mounts, label, avatar,
 * working directory, hooks, tags, etc.).
 *
 * Atomicity caveat: the flow is best-effort, NOT transactionally atomic. If
 * createDockerAgent fails after the soft-delete (port exhaustion, docker
 * daemon error, image-not-found, AMP keypair generation failure), the
 * operator is left with the old container gone and the old agent soft-
 * deleted but no new agent. Recovery requires manual undelete (clearing
 * deletedAt on the old registry entry) — name-reuse forces this ordering
 * since two live agents can't share a name. Auto-rollback is tracked as a
 * separate followup; the failure mode is rare in practice (mirrors the
 * exposure of today's manual delete-then-create flow).
 *
 * Why this exists: Docker bakes env vars (including AI_TOOL, which carries
 * programArgs) at `docker run` time. Hibernate→wake is `docker stop` +
 * `docker start` and faithfully preserves whatever env was originally baked
 * — so any registry-side mutation (UI edit, manual --keep-data delete +
 * curl POST recreate) silently fails to reach the running container until
 * a full container swap. Today's flow makes that swap manually (operator
 * assembles the create body), which drops fields the operator didn't
 * remember to forward — programArgs and hooks being the worst offenders.
 *
 * The new UUID + AMP keypair generation matches the existing recreate
 * pattern (containerName/port/websocketUrl re-derive from createDockerAgent,
 * same as today). Caller-side tooling (UI delete-and-recreate, CLI
 * recreate, ops scripts) should migrate to this endpoint so the preserve-
 * fields contract is enforced server-side.
 */
export async function recreateDockerAgent(
  agentId: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const oldAgent = getAgent(agentId, true) // include soft-deleted to distinguish 404 vs 410
  if (!oldAgent) return notFound('Agent', agentId)
  if (oldAgent.deletedAt) return gone('Agent')

  if (oldAgent.deployment?.type !== 'cloud' || oldAgent.deployment.cloud?.provider !== 'local-container') {
    return invalidState(
      `recreate is only supported for cloud agents with provider 'local-container' (agent ${agentId} is type=${oldAgent.deployment?.type ?? 'unset'}, provider=${oldAgent.deployment?.cloud?.provider ?? 'unset'})`
    )
  }

  // Stop + remove the old container if present. Both calls are non-fatal:
  // if the container is already stopped/removed/never-started we still want
  // to proceed to soft-delete + create. Failures here are usually
  // already-in-target-state, not a real error condition.
  //
  // Wall-clock timeouts are 60s — `docker stop` issues SIGTERM with a 10s
  // grace before SIGKILL, but a Claude Code session mid-`uv tool install`
  // can take longer than 15s to actually exit. A 60s ceiling gives graceful
  // shutdown room without blocking the operator indefinitely.
  const oldContainerName = oldAgent.deployment.cloud.containerName
  if (oldContainerName) {
    const safeContainerName = oldContainerName.replace(/[^a-zA-Z0-9_-]/g, '')
    try {
      await execAsync(`docker stop ${safeContainerName}`, { timeout: 60000 })
    } catch (err) {
      console.log(`[Recreate] stop ${oldContainerName} (non-fatal):`, err instanceof Error ? err.message : err)
    }
    try {
      await execAsync(`docker rm ${safeContainerName}`, { timeout: 60000 })
    } catch (err) {
      console.log(`[Recreate] rm ${oldContainerName} (non-fatal):`, err instanceof Error ? err.message : err)
    }
    // Verify removal — `docker run --name aim-<name>` will fail with a name
    // conflict if the prior container is still around (e.g. stop+rm wall-
    // clock-timed-out while the daemon was still gracefully stopping). Skip
    // the verification on inspect failure (means the container is gone, the
    // expected case).
    try {
      await execAsync(`docker inspect ${safeContainerName}`, { timeout: 5000 })
      // inspect succeeded → container still exists → name conflict will block create
      return operationFailed(
        'remove old container',
        `${oldContainerName} still exists after stop+rm; createDockerAgent would fail with a name conflict. Manual cleanup required.`
      )
    } catch {
      // inspect failed → container is gone, proceed
    }
  }

  // Soft-delete the old agent so the new one can take the same `name`
  // (getAgentByName excludes deletedAt entries). Soft-delete also removes
  // ~/.agent-messaging/agents/<old-UUID> to free the AMP index for the new
  // agent's registration; ~/.aimaestro/agents/<old-UUID> stays per the
  // audit-trail convention (centralized cleanup tracked separately).
  if (!deleteAgent(agentId, false)) {
    return operationFailed('soft-delete prior agent', `agent ${agentId} could not be marked as deleted`)
  }

  // Build the create body from the old agent's persisted fields. Container-
  // derived fields (containerName/port/websocketUrl) intentionally regenerate
  // inside createDockerAgent. AMP keypair regenerates per existing pattern.
  // persistFromAgentId carries the predecessor's UUID into createDockerAgent
  // so it can migrate claude/gh state across the audit-trail UUID rotation.
  const body: DockerCreateRequest = { ...buildRecreateBody(oldAgent), persistFromAgentId: agentId }

  const result = await createDockerAgent(body)
  if (result.status !== 200 || !result.data) return result

  // Patch the agent-record-but-not-DockerCreateRequest fields onto the new
  // agent. Done after createDockerAgent so the new agent's UUID is known.
  const newAgentId = (result.data as Record<string, unknown>).agentId
  if (typeof newAgentId === 'string' && newAgentId) {
    const patches: Partial<Agent> = {}
    for (const field of RECREATE_PRESERVED_FIELDS) {
      const value = (oldAgent as unknown as Record<string, unknown>)[field]
      if (value !== undefined) {
        ;(patches as unknown as Record<string, unknown>)[field] = value
      }
    }
    if (Object.keys(patches).length > 0) {
      try {
        updateAgent(newAgentId, patches as Parameters<typeof updateAgent>[1])
      } catch (err) {
        console.warn(`[Recreate] Could not patch preserved fields onto ${newAgentId}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  return {
    data: {
      ...result.data,
      recreatedFromAgentId: agentId,
      recreatedFromContainerName: oldContainerName,
      preservedFields: RECREATE_PRESERVED_FIELDS.filter(f => (oldAgent as unknown as Record<string, unknown>)[f] !== undefined),
    },
    status: result.status,
  }
}
