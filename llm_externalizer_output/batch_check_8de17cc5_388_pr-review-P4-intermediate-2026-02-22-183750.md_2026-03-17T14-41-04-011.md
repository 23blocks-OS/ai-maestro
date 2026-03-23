# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:04.011Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P4-intermediate-2026-02-22-183750.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P4-intermediate-2026-02-22-183750.md
- Line 56: - **File:** tests/use-governance-hook.test.ts:29-51
- Line 93: - **File:** tests/use-governance-hook.test.ts:43
- Line 120: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1678-1683
- Line 157: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:67-82
- Line 189: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:129
- Line 214: - **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:293-305
- Line 249: - **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:192-231
- Line 283: - **File:** tests/governance-request-registry.test.ts:44,63
- Line 299: - **File:** tests/governance-request-registry.test.ts:48,67
- Line 315: - **File:** tests/governance-request-registry.test.ts:565-590
- Line 331: - **File:** tests/governance-request-registry.test.ts:596-624
- Line 347: - **File:** tests/governance-request-registry.test.ts:447-559
- Line 363: - **File:** tests/use-governance-hook.test.ts:129-141
- Line 380: - **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:97
- Line 405: - **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:155,176
- Line 429: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:407-412
- Line 449: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:922
- Line 469: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:321, 1878-1884
- Line 496: - **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:162-164`: `// TODO: ToxicSkills scan on deployed content (11d safeguard) / When @/lib/toxic-skills is implemented, scan skill content here before deployment`
- Line 531: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts:129
- Line 551: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:15-36
- Line 569: - **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:32,70
- Line 591: - **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:306
- Line 616: - **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:192-201
- Line 639: - **File:** tests/governance-request-registry.test.ts:338-345
- Line 655: - **File:** tests/use-governance-hook.test.ts:27
- Line 671: - **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:29
- Line 687: - **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:82
- Line 703: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:406
- Line 719: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:833
- Line 739: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1321
```