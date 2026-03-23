# Cross-Platform Path Issues & Input Sanitization Audit

**Date:** 2026-03-13
**Files Audited:**
1. `services/agent-local-config-service.ts`
2. `app/api/agents/[id]/local-config/route.ts`
3. `types/agent-local-config.ts`
4. `hooks/useAgentLocalConfig.ts`
5. `components/AgentProfilePanel.tsx`

**Also checked:** `lib/validation.ts` (UUID validator)

---

## Summary

| Category | Issues Found |
|----------|-------------|
| Cross-platform path issues | 3 |
| Input sanitization issues | 5 |
| Total | 8 |

---

## CROSS-PLATFORM PATH ISSUES

### CP-1: `path.dirname(claudeDir)` produces wrong result when `claudeDir` uses Windows backslashes (MEDIUM)

**File:** `services/agent-local-config-service.ts`, line 318
**Code:**
```ts
path.resolve(path.dirname(claudeDir), plugin.path)
```

On Windows/WSL, if `claudeDir` arrives as `C:\Users\foo\project\.claude`, Node.js's `path` module will use the platform separator. However, the `claudeDir` value is constructed from `path.join(workDir, '.claude')` at line 46, which uses the platform separator correctly. The real risk is when `workDir` comes from the agent registry and contains forward slashes on Windows — `path.dirname` on a mixed-separator string may not split correctly on Windows.

**Fix:** Normalize `workDir` early with `path.resolve(workDir)` before any `path.join`.

---

### CP-2: Plugin paths from settings.json may contain forward slashes on Windows (LOW)

**File:** `services/agent-local-config-service.ts`, lines 314-318
**Code:**
```ts
const resolved = path.isAbsolute(plugin.path)
  ? plugin.path
  : path.resolve(path.dirname(claudeDir), plugin.path)
```

Plugin paths in `settings.json` are strings that could be authored on any platform. A path like `../plugins/my-plugin` is fine cross-platform, but `..\\plugins\\my-plugin` (authored on Windows, read on macOS/Linux) would not resolve correctly. The current code handles relative paths via `path.resolve` which is platform-aware, so this is acceptable for the same-platform case but fragile for cross-platform portability of settings files.

**Fix:** Before resolving, normalize separators: `plugin.path.replace(/\\/g, path.sep)`.

---

### CP-3: No home directory expansion for tilde (`~`) in plugin paths (MEDIUM)

**File:** `services/agent-local-config-service.ts`, lines 314-318

If a user writes `~/my-plugins/custom` in their settings.json plugin path, the code treats it as a relative path (since `path.isAbsolute('~/...')` returns `false` on Unix). It would then resolve relative to the project directory, producing a bogus path like `/project/~/my-plugins/custom`.

**Fix:** Add tilde expansion before the `isAbsolute` check:
```ts
let pluginPath = plugin.path
if (pluginPath.startsWith('~/')) {
  pluginPath = path.join(os.homedir(), pluginPath.slice(2))
}
```

---

## INPUT SANITIZATION ISSUES

### IS-1: CRITICAL — `pluginName` from untrusted JSON used directly in file path construction

**File:** `services/agent-local-config-service.ts`, line 257
**Code:**
```ts
let pluginName = path.basename(pluginPath)
// ... then from manifest JSON:
if (typeof m.name === 'string') pluginName = m.name
// ...
const agentTomlPath = path.join(pluginPath, `${pluginName}.agent.toml`)
```

The `pluginName` is read from `plugin.json` (line 248-249) which is user-controlled data on disk. A malicious `plugin.json` could set `name` to `../../etc/passwd` or `../../../.ssh/id_rsa`. When used in `path.join(pluginPath, \`${pluginName}.agent.toml\`)`, this enables path traversal to read arbitrary files via `extractTomlAgentName` and `extractTomlDependencies` (both call `fs.readFileSync`).

The same `pluginName` is also used at line 261:
```ts
const mainAgentPath = path.join(pluginPath, 'agents', `${mainAgentName}.md`)
```
where `mainAgentName = \`${pluginName}-main-agent\``.

**Severity:** HIGH — allows reading arbitrary files on the server if an attacker controls a plugin directory's `plugin.json`.

**Fix:** Validate `pluginName` contains no path separators or `..` sequences:
```ts
if (typeof m.name === 'string' && !m.name.includes('/') && !m.name.includes('\\') && !m.name.includes('..')) {
  pluginName = m.name
}
```
Or more robustly: `pluginName = path.basename(m.name)`.

---

### IS-2: Agent ID not URL-encoded in client-side fetch (LOW)

**File:** `hooks/useAgentLocalConfig.ts`, line 21
**Code:**
```ts
const res = await fetch(`/api/agents/${agentId}/local-config`)
```

The `agentId` is interpolated directly into the URL without `encodeURIComponent()`. While the API route validates UUID format (which doesn't contain special URL characters), this is a defense-in-depth gap. If validation were ever relaxed or bypassed, special characters in `agentId` could cause URL parsing issues.

**Fix:** Use `encodeURIComponent(agentId)`:
```ts
const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/local-config`)
```

---

### IS-3: `extractFrontmatterField` uses user-controlled `field` in regex without escaping (LOW)

**File:** `services/agent-local-config-service.ts`, line 386
**Code:**
```ts
const match = frontmatter.match(new RegExp(`^\\s*${field}:\\s*(.+)$`, 'm'))
```

The `field` parameter is passed directly into `new RegExp()`. If `field` contained regex metacharacters (e.g., `name.*`, `(bad)`), it could cause unexpected matching behavior or ReDoS. Currently `field` is always a hardcoded string literal (`'description'`, `'name'`), so this is not exploitable today but is a latent vulnerability.

**Fix:** Escape the field before regex interpolation:
```ts
const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const match = frontmatter.match(new RegExp(`^\\s*${escaped}:\\s*(.+)$`, 'm'))
```

---

### IS-4: `parseTOMLArray` uses user-controlled `key` in regex without escaping (LOW)

**File:** `services/agent-local-config-service.ts`, line 326
**Code:**
```ts
const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)]`, 'm'))
```

Same class of issue as IS-3. The `key` parameter comes from hardcoded strings (`'plugins'`, `'skills'`, etc.), so it's not exploitable today, but is a latent vulnerability if the function is ever called with dynamic input.

**Fix:** Same regex-escaping pattern as IS-3.

---

### IS-5: Plugin paths from settings JSON reach `fs.existsSync` and `fs.readFileSync` without path-scope validation (MEDIUM)

**File:** `services/agent-local-config-service.ts`, lines 296-301
**Code:**
```ts
for (const plugin of plugins) {
  if (typeof plugin?.path === 'string') {
    const resolved = path.isAbsolute(plugin.path)
      ? plugin.path
      : path.resolve(path.dirname(claudeDir), plugin.path)
    paths.add(resolved)
  }
}
```

Absolute paths from settings JSON are used as-is. A malicious or corrupted `settings.json` (or `settings.local.json`) could contain plugin paths pointing anywhere on the filesystem (e.g., `/etc/`, `/root/.ssh/`). These paths are later used in `scanPlugins` which calls `fs.existsSync`, `readJsonSafe` (which calls `fs.readFileSync`), and `extractTomlAgentName`/`extractTomlDependencies` (which call `fs.readFileSync`).

While the application is designed to run locally (Phase 1), this becomes a concern if:
- The server is exposed to a network
- Multi-tenant or remote agents are supported
- A supply-chain attack corrupts a settings.json

**Fix:** Validate that resolved plugin paths are within expected boundaries (e.g., under the project directory or user home):
```ts
const resolved = path.resolve(...)
if (!resolved.startsWith(path.resolve(workDir)) && !resolved.startsWith(os.homedir())) {
  console.warn(`[agent-local-config] Skipping out-of-scope plugin path: ${resolved}`)
  continue
}
```

---

## FILES WITH NO ISSUES

### `types/agent-local-config.ts`
- Pure type definitions, no runtime code. No issues.

### `components/AgentProfilePanel.tsx`
- Client-side React component. Renders data received from the API hook. No direct filesystem access. Displays `config.workingDirectory` and `config.rolePlugin.profilePath` as text, which is fine (no XSS risk in React's default escaping). No path issues.

### `app/api/agents/[id]/local-config/route.ts`
- Validates agent ID with `isValidUuid()` before passing to `scanAgentLocalConfig()`. The UUID regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) is strict and prevents path traversal in the `id` parameter. **This is correctly implemented.**

---

## RECOMMENDATIONS (Priority Order)

1. **IS-1 (CRITICAL):** Sanitize `pluginName` from `plugin.json` — use `path.basename()` to strip path components.
2. **IS-5 (MEDIUM):** Add scope validation for plugin paths from settings JSON.
3. **CP-3 (MEDIUM):** Add tilde expansion for plugin paths.
4. **CP-1 (MEDIUM):** Normalize `workDir` with `path.resolve()` early.
5. **IS-2 (LOW):** Add `encodeURIComponent` for defense-in-depth.
6. **IS-3, IS-4 (LOW):** Escape regex-interpolated strings.
7. **CP-2 (LOW):** Normalize path separators in plugin paths from JSON.
