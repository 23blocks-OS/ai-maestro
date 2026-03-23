# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:13.172Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P6-intermediate-2026-02-22-215258.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P6-intermediate-2026-02-22-215258.md
155: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/register/route.ts:15`
196: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`:29
214: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:64-65
229: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`:15
244: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`:21
258: - **File:** services/headless-router.ts:543
280: - **File:** services/headless-router.ts:612
299: - **File:** services/headless-router.ts:972
318: - **File:** services/headless-router.ts:980
337: - **File:** services/headless-router.ts:625
356: - **File:** services/headless-router.ts:594
375: - **File:** services/headless-router.ts:738
394: - **File:** app/api/agents/register/route.ts:15
413: - **File:** app/api/agents/route.ts:54
432: - **File:** app/api/agents/[id]/route.ts:35
451: - **File:** app/api/agents/[id]/route.ts:57
470: - **File:** app/api/agents/[id]/session/route.ts:22
489: - **File:** app/api/agents/normalize-hosts/route.ts:25
508: - **File:** app/api/agents/[id]/metrics/route.ts:35
522: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:58-61`
540: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:38-68`
558: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:30-105`
577: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:50-59`
598: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:56-59`
619: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:48-58`
638: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:49-58`
657: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:201-218`
676: - **File:** `/Users/emanuelesabetta/ai-maestro/server.mjs:2,377,759`
694: - **File:** `/Users/emanuelesabetta/ai-maestro/server.mjs:783-788`
713: - **File:** `/Users/emanuelesabetta/ai-maestro/services/help-service.ts:160`
733: - **File:** `/Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:~460-535`
754: - **File:** `/Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:80`
773: - **File:** `/Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:275-276`
800: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/governance.test.ts`
801: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts`
802: - **File:** `/Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts`
803: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts`
804: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts`
805: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts`
806: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts`
807: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts`
808: - **File:** `/Users/emanuelesabetta/ai-maestro/server.mjs`
809: - **File:** `/Users/emanuelesabetta/ai-maestro/services/help-service.ts`
810: - **File:** `/Users/emanuelesabetta/ai-maestro/services/hosts-service.ts`
811: - **File:** `/Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts`
812: - **File:** `/Users/emanuelesabetta/ai-maestro/services/sessions-service.ts`
813: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/register/route.ts`
814: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`
815: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`
816: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts`
817: - **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/reject/route.ts`
818: - **File:** services/headless-router.ts
819: - **File:** services/headless-router.ts
820: - **File:** services/headless-router.ts
821: - **File:** services/headless-router.ts
822: - **File:** services/headless-router.ts
823: - **File:** services/headless-router.ts
824: - **File:** services/headless-router.ts
825: - **File:** app/api/agents/register/route.ts
826: - **File:** app/api/agents/route.ts
827: - **File:** app/api/agents/[id]/route.ts
828: - **File:** app/api/agents/[id]/route.ts
829: - **File:** app/api/agents/[id]/session/route.ts
830: - **File:** app/api/agents/normalize-hosts/route.ts
831: - **File:** app/api/agents/[id]/metrics/route.ts
832: - **File:** `/Users/emanuelesabetta/ai-maestro/