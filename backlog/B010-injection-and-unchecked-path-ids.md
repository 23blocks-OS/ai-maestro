# B010 - Shell injection and unchecked ids that become file paths

**Status:** Done (0.62.0)
**Type:** Bug (security)
**Created:** 2026-10-07
**Found by:** read-only audit, 2026-10-07 (follow-up to B009). Items 1 to 3 were re-read by hand; item 4 and the low items are the auditor's reading only and need a second look before fixing.

CLAUDE.md: the network is the trust boundary, but injection is still fixed. External commands go through argv, never shell strings. An id that becomes a path must be a plain name.

## Findings

1. **Federation delivery: the sender picks the file path** (verified). `lib/amp-inbox-writer.ts:368` writes `path.join(inboxSenderDir, `${envelope.id}.json`)`, and line 428 does the same for sent messages. `envelope.id` is read from the POST body in `services/amp-service.ts` (`deliverFederated`, around line 1912) and `checkReplay` (`lib/amp-replay.ts`) does not validate its format. The route has no auth beyond an `X-AMP-Provider` header, and unsigned messages are still delivered. An id such as `../../../../x` with a valid local recipient writes attacker-controlled JSON to `<anything>.json` under the user's home. Fix: validate with `^[A-Za-z0-9_-]{1,128}$` at the choke point, reject otherwise, and test with `..`, absolute paths, NUL and very long ids.
2. **Shell injection in cloud agent creation** (verified). `services/agents-cloud-service.ts` interpolates `awsProfile`, `awsRegion` and the repo name into `execAsync` strings (about lines 79, 239, 251, 298). `awsProfile` and `awsRegion` come from the request body (about lines 325-326) unvalidated. Fix: `execFile` with argv, and validate profile and region against `^[A-Za-z0-9_.-]+$`.
3. **Shell injection when importing an agent export** (verified). `services/agents-transfer-service.ts:188` runs ``git clone --branch ${branch} "${repo.remoteUrl}" "${targetPath}"`` through `execSync`. `branch` is unquoted and `$(...)` or backticks still run inside the quoted URL. Values come from the imported manifest, so a crafted export package gets command execution on import. Fix: `execFileSync('git', ['clone', '--branch', branch, '--', url, target])`, validate the branch name, allow only http(s) and ssh URLs.
4. **Schedule and brain-inbox routes take agent ids unchecked** (auditor's reading). `app/api/agents/[id]/schedule/route.ts` passes the id to `writeSchedule` (`lib/agent-schedule.ts`), which does `mkdirSync(recursive)` and writes `schedule.json`. Next decodes `%2F`, so `..%2F..%2Fx` can write outside `~/.aimaestro/agents`. Any junk id such as `foo` creates a folder (the B009 class). POST `{run:true}` calls `runDueTasks(id)` on an unknown id. `app/api/agents/[id]/brain-inbox/route.ts` and `lib/cerebellum/brain-inbox.ts` truncate and write `<id>/brain/cortex-inbox.jsonl`. Neither calls `unknownAgentResult` (`services/agent-guard.ts`). Fix: guard both, and extend the B009 "every service that loads an agent checks the id" test to the route and lib writers.
5. **Low** (auditor's reading): `readStatusFile` (`services/agents-subconscious-service.ts`), `readAgentStatusFile` (`services/config-service.ts`) and `readSchedule` use the id unvalidated on read paths. `broadcastActivityUpdate` (`services/sessions-service.ts`) lets any `sessionName` from `POST /api/sessions/activity/update` create a `hookStatusMap` entry that is never pruned. `lib/transcript-export.ts` `outputPath` writes anywhere (no caller found).
6. Checked and fine: canvas file paths (rejects `..`, absolute paths and escapes, though not symlinks), uploads, avatars, team and document ids, skills settings, tmux session names.

## Plan

One patch release. A shared `isSafeName` helper for ids used in paths. Tests with hostile ids for every item, run against a temporary `HOME`. Re-read items 4 and 5 before writing code.
