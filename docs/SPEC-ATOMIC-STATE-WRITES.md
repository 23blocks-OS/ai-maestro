# Spec: safe writes to the agent registry and to Claude Code's config

**Status:** Draft for review (2026-11-18)
**Backlog:** B042
**Source:** idea from `CamiloCaceres/lolad` (MIT), reviewed 2026-11-18 at `2649a3f`. The problems below were checked in our own code.
**Size:** S (one helper, two call sites, tests)

## 1. Problem, with evidence

### 1.1 The registry is written in place

`saveAgents` in `lib/agent-registry.ts` (line 212) does `fs.writeFileSync(REGISTRY_FILE, data)`. This truncates the file, then writes about 230 KB (the registry on a host with 95 agents). If the process stops in that window (pm2 restart, crash, power, full disk), the file is empty or cut short.

### 1.2 An unreadable registry reads as "no agents", and the next save makes it true

`loadAgents` (line 154) catches every error and returns `[]`. A parse error from a cut-short file is such an error. Every write path is "load, change, save" (about 30 calls to `saveAgents`, for example create, update, rename, delete). So after one bad write, the next change saves a registry that holds only the agent that was just changed. All other agents are lost. The backups (`registry.json.bak`, `registry.backup.<time>.json`) are manual or made by scripts, not by this path.

Other readers in other processes can also see a half-written file: the Claude Code hook (`scripts/claude-hooks/ai-maestro-hook.cjs` line 92), `lib/agent-db-sync.mjs` and several scripts in `scripts/`.

### 1.3 The trust write to `~/.claude.json` races with Claude Code

`trustProjectDirectory` (line 257) reads `~/.claude.json`, adds `hasTrustDialogAccepted` for one folder, and writes the whole file back in place (line 275). The file is about 450 KB, and every running Claude Code process writes it too. Two problems:

- **Lost update.** If a Claude Code process writes between our read and our write, we put back its old content.
- **Torn file.** If we stop during the write, `~/.claude.json` is cut short, and every Claude Code session on the host has a broken config.

### 1.4 The trust goes to the wrong file for agents with their own login folder

An agent can run with its own login folder (`aim-launch.sh config-dir <folder>`, which sets `CLAUDE_CONFIG_DIR`). Claude Code then keeps its global config in `<folder>/.claude.json`, not in `~/.claude.json` (Claude Code docs, "configuration"; to confirm with a test in the fix). `trustProjectDirectory` always writes `~/.claude.json`, so such an agent still stops at the "Do you trust the files in this folder?" dialog.

### 1.5 We already know the fix, in four copies

`lib/amp-known-keys.ts` (line 41), `lib/wake-state.ts` (line 83), `lib/secret-vault.mjs` (line 58) and others write a temp file and rename it. Each copy is slightly different (fixed `.tmp` name in `wake-state.ts`, so two writers can collide; no `fsync` anywhere).

## 2. Goals and non-goals

Goals:

1. A reader never sees a half-written registry or `~/.claude.json`.
2. A registry that cannot be read is never replaced by a smaller one.
3. The trust flag goes to the config file the agent's Claude Code really reads.
4. One helper, used by the registry, the trust write and the existing copies.

Non-goals:

- A database for the registry. JSON stays.
- Locks across hosts. Each host owns its own registry. Hosts do not write each other's files (the owning-host rule).
- Changing how Claude Code itself writes its file.

## 3. Design

### 3.1 `lib/atomic-write.mjs`

```js
// writeFileAtomicSync(file, data, { mode })
// 1. tmp = `${file}.${process.pid}.${counter}.tmp` in the same folder (rename is atomic only on one file system)
// 2. open tmp with flag 'wx' (fail if it exists) and the mode of the old file, or `mode`
// 3. write, fsync the file, close
// 4. rename tmp -> file
// 5. fsync the folder (best effort; skip on Windows)
// on any error: unlink tmp, rethrow
```

This is the pattern of npm's `write-file-atomic` and of the POSIX `rename()` guarantee. We do not add the package: it is about 40 lines, and we need a sync version that keeps a `.mjs` import for `server.mjs`.

Refuse to write when `file` is a symbolic link (`lstat`). The write would replace the link with a file and cut the link. Log and return an error instead.

### 3.2 The registry

- `saveAgents` calls `writeFileAtomicSync`.
- `loadAgents` tells "no file" from "file I cannot read". No file: `[]`, as today. A file that does not parse, or is not an array: log once, keep the last good copy in memory, and set a flag `registryUnreadable`. While the flag is set, `saveAgents` refuses and returns `false`. The Doctor reports it (`agent-registry` check, fail) with the path and the parse error.
- Before the first save of a process run, copy the current good file to `registry.json.last-good`. One copy, overwritten each run. This gives the operator one step back without a new retention problem.

A lock between processes is not needed today: every writer of the registry is the server process, and its registry functions are synchronous, so two writes cannot interleave on the event loop. Scripts that write the registry must go through the API. The spec adds a test that fails when a file outside `lib/agent-registry.ts` writes `registry.json` (like `tests/no-unsafe-tmux-kill.test.ts`).

### 3.3 The trust write

1. Find the config file: `$CLAUDE_CONFIG_DIR/.claude.json` for an agent that runs with a login folder (its credential profile), else `~/.claude.json`. Use the agent's profile, not the server's environment.
2. Resolve the real path. Refuse a symbolic link, a file that is not a regular file, and a file that does not parse. Never create the file.
3. Read, change one key, write with `writeFileAtomicSync`.
4. Lost update: read the file's `mtimeMs` and size before and just before the rename. If either changed, read again and redo the change (at most three times). This makes the window very small. It cannot close it, because Claude Code takes no lock we can share. The change is idempotent (it sets one flag to true), so a lost write only means the operator sees the dialog once, as today.

Better option to check first: if a Claude Code release accepts the trust choice from a flag or from project settings, use that and stop writing the shared file. (Open question 2.)

### 3.4 The other copies

Move `amp-known-keys.ts`, `wake-state.ts`, `secret-vault.mjs` and the others found by `grep renameSync lib services` to the helper, one by one, in the same PR only when the change is mechanical.

## 4. Security considerations

- Reduces risk: no torn security files (`secret-vault`, `amp-known-keys`), and a registry loss can no longer delete agents.
- The temp file is created with `wx` and the final file's mode, so a secret file is never readable by others for a moment (`secret-vault` writes `0600`).
- Refusing symbolic links stops a link planted in `~/.aimaestro` from making the server overwrite another file. Agents on one host are not isolated from each other (B021), so this is defense in depth, not a boundary.
- No new network surface.

## 5. Tests

- Unit: the helper writes, keeps the mode, cleans up the temp file on error, refuses a symbolic link.
- Unit: `loadAgents` on a cut-short file sets `registryUnreadable`; `saveAgents` then returns `false` and the file is unchanged.
- Unit: the trust write picks `$CLAUDE_CONFIG_DIR/.claude.json` for an agent with a login folder; refuses a link and a file that does not parse; never creates the file.
- Crash test: a child process writes the registry in a loop and is killed with SIGKILL at random times; after each kill the file parses. (Temp HOME; no tmux.)
- Guard test: no file other than `lib/agent-registry.ts` writes `registry.json`.

## 6. Rollout

One patch release. No data migration. The first run makes `registry.json.last-good`. The Doctor check is new and additive (contract v2).

## 7. Open questions for Juan

1. **When the registry is unreadable, refuse writes or start empty?** Recommended: refuse writes and show it in the Doctor. Starting empty is how agents are lost today.
2. **Keep writing `~/.claude.json` at all?** Recommended: yes for now, with the re-read guard; replace it as soon as Claude Code offers a supported way to pre-trust a folder.
3. **Add `write-file-atomic` or our own helper?** Recommended: our own (40 lines, sync, `.mjs`), with the tests above.

## 8. Sources

- POSIX `rename()`: the new name refers to the new file or the old one, never neither. https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html
- npm `write-file-atomic` (temp file, fsync, rename, cleanup). https://github.com/npm/write-file-atomic
- Dan Luu, "Files are hard" (why fsync and the folder fsync matter). https://danluu.com/file-consistency/
- `proper-lockfile` (mkdir-based lock across processes; not needed here, see 3.2). https://github.com/moxystudio/node-proper-lockfile
- Claude Code configuration (`CLAUDE_CONFIG_DIR` moves the user files). https://code.claude.com/docs/en/configuration
