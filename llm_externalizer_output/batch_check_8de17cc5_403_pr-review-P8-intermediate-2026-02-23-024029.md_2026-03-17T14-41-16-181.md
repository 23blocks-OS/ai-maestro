# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:16.182Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P8-intermediate-2026-02-23-024029.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P8-intermediate-2026-02-23-024029.md
100: - **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:59
107: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
121: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:322-325
134: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:60-61
146: - **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:779-780
158: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:121
170: - **Evidence:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:162-165` -- explicit TODO, no implementation.
183: - **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:107-111
199: - **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:26-35
215: - **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:79-91
235: - **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts:114-126
253: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:65-73
269: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:46-57
280: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts`:72
293: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts`:56
304: - **File:** app/api/meetings/[id]/route.ts:17, :43, :65
323: - **File:** app/api/meetings/route.ts:11, :29
334: - **File:** app/api/organization/route.ts:27
345: - **File:** app/api/v1/health/route.ts:19, app/api/v1/info/route.ts:19, app/api/v1/messages/pending/route.ts:28,:43,:63, app/api/v1/register/route.ts:28, app/api/v1/route/route.ts:37
363: - **File:** app/api/hosts/identity/route.ts:13-14
379: - **File:** app/api/meetings/[id]/route.ts:7-18 vs :22-44
399: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/health/route.ts:21-25
414: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:37
429: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:36,40-41
446: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/consolidate/route.ts:53-54
460: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/messages/[messageId]/route.ts:24
473: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:38
486: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/memory/long-term/route.ts:42
499: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/search/route.ts:38
512: - **File:** Multiple files
535: - **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:10-15
557: - **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:28
559:   The same issue exists in `TransfersFile` (line 63) and `GovernanceRequestsFile` (`governance-request.ts:118`), and `TeamsFile` (`team.ts:42`), and `MeetingsFile` (`team.ts:64`).
576: - **File:** components/TerminalView.tsx:72
599: - **File:** components/TerminalView.tsx:78-79
614: - **File:** components/TerminalView.tsx:577, 582, 586
639: - **File:** app/teams/page.tsx:37-51
662: - **File:** `app/api/governance/manager/route.ts`:24-37
683: - **File:** `app/api/governance/transfers/route.ts`:17-18
705: - **File:** `services/governance-service.ts`:138-139
726: - **File:** `app/api/v1/governance/requests/[id]/reject/route.ts`:76
744: - **File:** `app/api/governance/reachable/route.ts`:12-13
765: - **File:** `services/governance-service.ts`:188-194
786: - **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:208-216
809: - **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:44-54
829: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:926-928
845: - **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:52-75
866: - **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:279-281
885: - **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:43-47
904: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:659-698
938: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1014-1016
957: - **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:149-151
975: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:114-116
994: - **File:** /Users/emanuelesabetta/ai-