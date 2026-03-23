# Haephestos UI Improvements Spec

## Task: Improve the Haephestos agent creation section

### 1. Left Panel (`HaephestosLeftPanel.tsx`) — Major rewrite

**File upload inputs**: Add 3 permanent, labeled file input fields for:
- **Codebase Reference** — a file the user can upload as codebase context
- **Skills Catalog** — PSS output or skill list
- **Additional Context** — any extra reference file

Each field: a labeled row with file name (or "No file selected"), a Browse button, and an X to remove.

**Inject Context button**: Below the 3 inputs, add a prominent button "Inject Files into Chat" that calls a handler (passed as prop) to automatically send the 3 file paths to Haephestos via the terminal, so the user doesn't need to type them in the prompt.

**Title**: "Workshop" label should be bigger and brighter — use `text-sm font-bold text-amber-400` instead of `text-xs text-gray-500`.

**Back arrow**: Add a left arrow (`ArrowLeft` from lucide) at top-left that calls `onClose` (same as cancel).

**Avatar**: Bigger since panel is now 30% width — remove the `max(40, min(160, ...))` cap and let it scale up to ~200px.

### 2. Page Layout (`page.tsx`) — Layout changes

**Panel proportions**: Change from pixel-based widths to percentage-based:
- Left: 30% (was ~200px)
- Terminal: 30%
- Right: 40%
- Remove drag-resize (percentages are fixed, simpler)

**Header**:
- Replace "Haephestos / Agent Creator" with a bigger title: `text-base font-bold` for "Haephestos" and `text-sm` for subtitle
- Add `ArrowLeft` icon at far left as back button (same as cancel)
- Remove the X button (redundant with back arrow and cancel)

**Buttons**: Make bigger:
- Desktop: `px-6 py-2.5 text-sm` (was `px-4 py-1.5 text-sm`)
- Mobile: `px-4 py-2 text-sm` (was `px-3 py-1.5 text-xs`)

**File upload handler**: Pass `handleInjectFiles` callback to `HaephestosLeftPanel` that formats and sends file paths to Haephestos terminal.

**Mobile**: Keep responsive — tab bar for panels, slide-up sheets, slightly larger touch targets.

### 3. Haephestos permissions (`ensure-persona` API)

Create `~/agents/haephestos/.claude/settings.local.json` with pre-approved permissions so Haephestos can use bash for file operations without user confirmation:
```json
{
  "permissions": {
    "allow": [
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(touch:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(wc:*)",
      "Bash(find:~/agents/haephestos/*)"
    ]
  }
}
```
