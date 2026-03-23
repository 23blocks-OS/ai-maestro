# README.md Documentation Fixes Report
Date: 2026-03-23

## Source file fixed
`/Users/emanuelesabetta/ai-maestro/README.md`

## Findings source
`.rechecker/reports/rck-20260323_025806_794461-[LP00002-IT00001-FID00001]-review.md`

## Fixes Applied

### Fix 1: Inconsistent Skill Count (line 91)
- **Before**: `Claude Code plugin with 7 skills and 32 CLI scripts`
- **After**: `Claude Code plugin with 9 skills and 32 CLI scripts`
- **Reason**: The Agent Skills section (line 230+) lists exactly 9 skills in the table. The Quick Start was using an outdated count of 7.

### Fix 2: Misleading API Reference Link Label (line 229)
- **Before**: `[API Reference](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)`
- **After**: `[Agent Communication Architecture](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)`
- **Reason**: The file `AGENT-COMMUNICATION-ARCHITECTURE.md` documents the communication architecture, not a general plugin API reference. The label "API Reference" misled plugin developers expecting an API reference document.

### Fix 3: Missing amp-init.sh Step in Quick Start (after line 122)
- **Added**: A paragraph after "Dashboard opens at `http://localhost:23000`" instructing users to run `amp-init.sh --auto` to initialize agent messaging identity.
- **Reason**: The AMP messaging feature requires this initialization step (shown in CLI Reference section), but the Quick Start omitted it, leaving users unable to use agent messaging after install.

### Fix 4: Ambiguous Persona Case Handling Documentation (line 56)
- **Before**: "Internally always handled as lowercase (so `Sammy` and `sammy` are the same persona when sending messages), but the UI always displays it capitalized."
- **After**: "Input is case-insensitive — the system normalizes all persona names to lowercase internally (so `Sammy` and `sammy` refer to the same persona in commands and messages). The UI displays persona names capitalized for readability."
- **Reason**: The original phrasing was ambiguous about what input case users should use. The new phrasing explicitly states input is case-insensitive and explains both the internal normalization and the UI display behavior without contradiction.

### Fix 5: Code Graph Link Points Directly to Image (line 222)
- **Before**: `[Code Graph](./docs/images/code_graph01.png)`
- **After**: `[Code Graph Visualization](./docs/images/code_graph01.png)`
- **Reason**: The label "Code Graph" in a documentation list implies a documentation page, but the link targets a `.png` image. Renaming to "Code Graph Visualization" accurately communicates that the link opens an image, preventing user confusion. No dedicated `docs/CODE-GRAPH.md` file exists in the repo; creating one is a separate content authoring task beyond this fix.

## No Files Created or Deleted
Only `/Users/emanuelesabetta/ai-maestro/README.md` was modified.
