# Build Check — 2026-03-22

## Result: FAILED

`yarn build` exited with code 1. Four files have syntax/duplicate-definition errors:

---

### 1. `components/plugin-builder/BuildAction.tsx` (line 194)

**Error:** `Expected ',', got 'pollRef'`

```
191 |           }
192 |         }
193 |         // Kick off the first poll
194 |         pollRef.current = setTimeout(pollStatus, 1000)
              ^^^^^^^
195 |       } else {
```

Likely a missing closing brace or paren above line 194.

---

### 2. `components/plugin-builder/PluginComposer.tsx` (line 155)

**Error:** `the name 'getSkillDisplayName' is defined multiple times`

Function `getSkillDisplayName` is declared twice in the same file. The duplicate definition starts at line 155.

---

### 3. `components/plugin-builder/SkillPicker.tsx` (line 114)

**Error:** `Expected ',', got '.'`

```
111 |     { id: 'core' as const, label: 'Core', count: filteredCoreSkills.length },
112 |     { id: 'marketplace' as const, label: 'Marketplace', count: filteredMarketplaceSkills.length },
113 |     { id: 'repo' as const, label: 'GitHub Repo', count: null },
114 |   ], [marketplaceSkills.length])
                       ^
```

Likely a malformed `useMemo` or similar hook — missing opening call before the array.

---

### 4. `app/api/plugin-builder/builds/[id]/route.ts` (lines 28–38)

**Error:** `Expected a semicolon` / `Return statement is not allowed here` / `Expression expected`

```
28 |       )
29 |     }
30 |     return NextResponse.json(result.data)
31 |   } catch (error) {
        ^^^^^
32 |     console.error('Error getting build status:', error)
33 |     return NextResponse.json(
34 |       { error: 'Internal server error' },
35 |       { status: 500 }
36 |     )
37 |   }
38 | }
```

Mismatched braces — `try/catch` structure is broken (likely missing `try {`).

---

### 5. `lib/messageQueue.ts` (lines 258–263)

**Error:** `the name 'fromAgent' is defined multiple times` / `the name 'toAgent' is defined multiple times`

Duplicate `const` declarations:
- `fromAgent` defined at line 258 and again at line 262
- `toAgent` defined at line 259 and again at line 263

A block of code (lines 257–259) was duplicated at lines 261–263.

---

## Summary

| File | Error Type | Line(s) |
|------|-----------|---------|
| `BuildAction.tsx` | Syntax (missing brace/paren) | 194 |
| `PluginComposer.tsx` | Duplicate function definition | 155 |
| `SkillPicker.tsx` | Syntax (malformed hook) | 114 |
| `builds/[id]/route.ts` | Syntax (broken try/catch) | 28–38 |
| `messageQueue.ts` | Duplicate variable definitions | 258–263 |
