# fix-readme-iter3 Report — 2026-03-23

## Fix 1: PERSONA examples clarity (line 50)

Added clarifying note immediately after the attributes table (before `### AGENT-ID`):

```
*(Examples above show display-format capitalization; internally stored as lowercase)*
```

This resolves the ambiguity between the table showing capitalized persona names (`Peter-Parker`, `Lucy-In-The-Sky`, etc.) and the PERSONA section prose stating names are normalized to lowercase internally.

## Fix 2: Plugin uninstall scope (line 325)

Changed:
```
aimaestro-agent.sh plugin uninstall my-plugin
```
To:
```
aimaestro-agent.sh plugin uninstall my-plugin --scope local
```

Now consistent with the install example directly above it which already had `--scope local`.

## Status: DONE — both fixes applied, verified by re-reading the affected lines.
