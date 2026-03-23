# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:43:00.271Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/llm_externalizer_output/batch_check_81b8a82f_1_amia_github_lifecycle_core.py_2026-03-13T05-44-07-111.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/llm_externalizer_output/batch_check_81b8a82f_1_amia_github_lifecycle_core.py_2026-03-13T05-44-07-111.md
Line 1: - **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/scripts/amia_github_lifecycle_core.py`
Line 5: - **Task**: You are analyzing Python scripts from the "AI Maestro Integrator Agent" (AMIA). These manage GitHub Projects V2 kanban and PR quality gates.
Line 16: - API ENDPOINTS: Any direct calls to AI Maestro API (localhost:23000)?
Line 22: The user wants me to analyze the provided Python script and extract specific information about GitHub Projects V2, kanban columns, card operations, quality gates, API endpoints, and sync direction.
Line 25: 1. **GITHUB PROJECTS V2 GRAPHQL**: Looking at the code, I don't see any GraphQL queries or mutations in this file. This appears to be a core utilities module with data classes and helper functions, but no GraphQL operations.
Line 38: 5. **API ENDPOINTS**: No direct calls to AI Maestro API (localhost:23000) in this file.
Line 43: This file (`amia_github_lifecycle_core.py`) appears to be a utility module that:
Line 46: It's NOT the file that handles GitHub Projects V2 or the actual lifecycle automation - it seems to be a supporting utility module.
Line 50: ### 1. GITHUB PROJECTS V2 GRAPHQL
Line 59: ### 5. API ENDPOINTS
Line 60: **None found.** No calls to AI Maestro API (localhost:23000).
Line 70: To find GitHub Projects V2 GraphQL, kanban columns, card operations, and quality gates, you would need to examine **other files** in the AMIA suite that handle those specific functionalities.
```