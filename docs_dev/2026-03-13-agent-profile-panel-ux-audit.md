# AgentProfilePanel UX Audit

**Date:** 2026-03-13
**Auditor:** Opus 4.6
**Files reviewed:**
- `/Users/emanuelesabetta/ai-maestro/components/AgentProfilePanel.tsx` (399 lines)
- `/Users/emanuelesabetta/ai-maestro/components/AgentConfigPanel.tsx` (350 lines)
- `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-12-agent-profile-panel-redesign.md`

---

## Summary

The `AgentProfilePanel` is a well-structured tabbed inspector with a clean layout, but it is currently **read-only with no interactive affordances**. Every UX requirement from the audit checklist has significant gaps. The component is essentially a "viewer" -- it shows what exists but offers no way to act on what is shown.

---

## Issue 1: NO "Create new..." Options Anywhere (CRITICAL)

**Requirement:** Wherever there is a choice menu of existing options (role-plugins, plugins, skills, etc.), there MUST be an option to "Create new..."

**Current state:** There are ZERO choice menus, ZERO dropdowns, ZERO "Add" buttons, and ZERO "Create new..." options in the entire component. Every tab uses `ListTab` or custom renderers that only display existing items. When a list is empty, the user sees static italic text like "No plugins installed" with no call-to-action.

**What must change:**

### All list tabs (Plugins, Skills, Agents, Hooks, Rules, Commands, MCPs)
- Add an `[+ Add]` button at the top of each list tab
- Clicking it should open a dropdown/dialog with:
  - A list of available/installable items (fetched from marketplace, global installs, or filesystem)
  - A "Create new..." option at the bottom of the list
- For the empty state: replace the passive "No X installed" text with a prominent `[+ Add First X]` button

### Role tab specifically
- When no role-plugin is assigned, the current "No Role-Plugin assigned" text has NO button to assign one. This is the most critical gap.
- Must add: `[Assign Role-Plugin]` button with a dropdown showing available role-plugins + "Create new Role-Plugin + Persona with Haephestos" option

---

## Issue 2: Haephestos Description Inaccuracy (MODERATE)

**Requirement:** Haephestos creates Personas WITH new or customized Role-Plugins. It CANNOT create Personas without Role-Plugins. It CAN assign an existing Role-Plugin to a new Persona. It must NOT create a Role-Plugin without Persona. Any Role-Plugin created for a Persona can be reused in different Personas.

**Current state:** The only Haephestos reference in `AgentProfilePanel` is the `[Edit in Haephestos]` button (line 269), which is labeled correctly. However:

1. **The "Create new..." option for role-plugins does not exist**, so there is no place where the Haephestos description could even be wrong -- it is simply absent.

2. **When added**, the "Create new..." option in the Role tab must be labeled:
   - "Create new Role-Plugin + Persona with Haephestos" (correct)
   - NOT "Create new Role-Plugin" (wrong -- implies Role-Plugin without Persona)
   - NOT "Create new Persona" (wrong -- implies Persona without Role-Plugin)

3. **The [Edit in Haephestos] button text is fine**, but it should include a tooltip/helper explaining: "Opens Haephestos to edit this Persona's Role-Plugin. Changes apply to all Personas using this Role-Plugin."

4. **Missing:** An option to "Assign existing Role-Plugin" that shows a dropdown of available role-plugins from the marketplace or already-installed ones, without launching Haephestos.

---

## Issue 3: NO Helper Text / Explanatory Guidance (CRITICAL)

**Requirement:** Every popup/dialog/modal should have explanatory helper text. The user should never be confused about what to do.

**Current state:** There are ZERO helper texts, ZERO tooltips, and ZERO explanatory paragraphs in the entire component. The user is presented with raw data labels and values with no context.

**Specific gaps:**

| Location | What's Missing |
|----------|----------------|
| Panel header | No description of what this panel is for ("Live inspector of this agent's local configuration") |
| Tab bar | No tooltip on tabs explaining what each tab contains |
| Settings tab | No explanation of what "Working Dir" means, what "Last Scanned" means, or that settings come from `.claude/settings.local.json` |
| Role tab (no role) | No explanation of what a Role-Plugin is or why the user might want one |
| Role tab (has role) | No explanation that the Role-Plugin is the source of truth and can only be edited via Haephestos |
| Global Dependencies section | The "(read-only)" label is good, but no explanation of WHY it is read-only or how to manage global deps |
| Empty states | "No plugins installed" tells the user nothing about how to install one |
| List items | No tooltip showing the full path or additional metadata when hovering |

**What must change:**
- Add a subtle helper line below the panel header: "Live configuration from .claude/ folder"
- Add tooltips to each tab: "Skills installed in .claude/skills/"
- Change empty states from passive text to actionable guidance: "No plugins installed. Click [+ Add] to install from marketplace or local path."
- Add a one-liner explanation at the top of the Role tab: "Role-Plugins define the agent's persona, skills, and behavior. Assign one to give this agent a specialized role."
- Add a tooltip to [Edit in Haephestos] explaining the implications

---

## Issue 4: Manual Typing Where Lists Should Exist (CRITICAL)

**Requirement:** If there are known options (role-plugins from marketplace, installed plugins, etc.), show a dropdown/select instead of requiring manual text input.

**Current state:** This issue manifests as ABSENCE rather than wrong implementation -- there are no input fields at all. However, when add/install functionality is implemented, it MUST use:

- **Role-Plugin assignment:** Dropdown of detected role-plugins (from marketplace + locally installed) -- NOT a text field where the user types a plugin name
- **Plugin installation:** Dropdown or searchable list of available plugins -- NOT a raw text input for a path/URL
- **Skill installation:** Same pattern
- **MCP server addition:** Structured form (name, command, args) with command suggestions -- NOT a single text field
- **Hook addition:** Form with event type dropdown (PreToolUse, PostToolUse, etc.) -- NOT free-text

**Risk:** If implementation proceeds without this requirement, developers will default to `<input type="text" placeholder="Enter plugin name..." />` which violates the UX goal.

---

## Issue 5: Tab Content Completeness and Count Badge Accuracy (MODERATE)

**Requirement:** Each tab should show meaningful content, not just raw text. Count badges should be accurate.

### Count badge issues:
- **Settings tab:** Shows no count badge (correct -- settings are not countable items)
- **Role tab:** Shows no count badge (correct -- it is 0 or 1, shown by presence/absence)
- **Other tabs:** Count badges only show when `count > 0` (line 138). When count is 0, no badge appears. This is **acceptable** but **inconsistent** -- a "0" badge would communicate that the tab has been scanned and found empty, vs. no badge which could mean "not scanned yet"

### Content completeness issues:

| Tab | Issue |
|-----|-------|
| **Settings** | Shows only `workingDirectory`, `lastScanned`, and raw settings key-value pairs. Missing: agent Name, Program, Model, Role/Title (manager/chief-of-staff/member), Program Args, Tags. The design spec (section 4) requires all of these. Currently these fields exist in `AgentConfigPanel` but NOT in `AgentProfilePanel`. |
| **Role** | Shows role-plugin name and profile path. Missing: Role-Plugin version, install scope, enabled/disabled toggle |
| **Plugins** | Shows name and description only. Missing: install scope (local/project/user), enabled/disabled state, version |
| **Skills** | Adequate -- shows name and description |
| **Agents** | Adequate -- shows name and description |
| **Hooks** | Shows name and event type. Adequate. |
| **Rules** | Shows name and preview. Adequate. |
| **Commands** | Shows name and trigger. Adequate. |
| **MCPs** | Shows name, command, args. Missing: connection status (the spec says "connection status" should be shown) |

---

## Issue 6: Role Tab Deficiencies (CRITICAL)

**Requirement:** Should show the role-plugin name, [Edit in Haephestos] button, and if no role-plugin is assigned, a clear [Assign Role-Plugin] button with dropdown showing available options + "Create new with Haephestos".

**Current state vs. requirement:**

| Requirement | Status | Details |
|-------------|--------|---------|
| Show role-plugin name | DONE | Line 255: `{config.rolePlugin.name}` |
| [Edit in Haephestos] button | DONE | Lines 259-272, but only shown when `onEditInHaephestos` callback is provided |
| [Assign Role-Plugin] button (no role) | MISSING | The empty state (lines 243-247) shows only passive text and an icon. No button exists. |
| Dropdown of available role-plugins | MISSING | No dropdown component exists anywhere in the file |
| "Create new with Haephestos" option | MISSING | No such option exists |
| Role-Plugin ON/OFF toggle | MISSING | The design spec mentions a toggle in Settings tab. Neither tab has it. |

**What must change:**

When `config.rolePlugin` is null (lines 241-247), replace the empty state with:
```
[Shield icon]
No Role-Plugin assigned

A Role-Plugin defines this agent's persona, specialized skills, and behavior rules.

[Assign Existing Role-Plugin v]     ← dropdown with available options
   - ai-maestro-chief-of-staff
   - ai-maestro-architect
   - ai-maestro-programmer
   - ...
   ─────────────────────────
   Create new Role-Plugin + Persona with Haephestos

[or] Edit without Role-Plugin      ← for agents that don't need a persona
```

---

## Issue 7: Settings Tab Missing Key Fields (CRITICAL)

**Requirement:** Should show agent Title (manager/chief-of-staff/member), Name, Role-Plugin, Working Directory, Program, Model, etc. -- not just raw settings JSON.

**Current state (lines 196-228):**

The Settings tab currently shows:
1. `Working Dir` -- from `config.workingDirectory`
2. `Last Scanned` -- from `config.lastScanned`
3. Raw settings key-value pairs (filtered to exclude `plugins` and `lspServers`)
4. LSP Servers list

**What is MISSING:**
- Agent Name (the registered agent name)
- Agent Title/Role (manager / chief-of-staff / member)
- Program (e.g., `claude`, `claude --agent main-agent`)
- Model (e.g., `claude-sonnet-4-20250514`)
- Program Args (extra CLI flags)
- Tags (agent tags for categorization)
- Role-Plugin toggle (ON/OFF with selector)
- The settings are displayed as raw JSON key-value pairs instead of structured, labeled fields

**Comparison with AgentConfigPanel:** The `AgentConfigPanel` (Haephestos creation) DOES show Name, Program, Model, Role, Dir as structured `InfoRow` components with icons (lines 218-224). The `AgentProfilePanel` Settings tab should mirror this structure.

**What must change:**

The Settings tab should be restructured to show:
1. **Identity section:** Name, Title (manager/cos/member), Working Directory
2. **Runtime section:** Program, Model, Program Args
3. **Tags section:** Tag chips (like in AgentConfigPanel)
4. **Role-Plugin toggle:** ON/OFF switch with plugin selector
5. **Advanced section (collapsible):** Raw settings, LSP servers

---

## Issue 8: No Install/Uninstall/Add/Remove Actions (STRUCTURAL)

The design spec (section "API Design") defines `POST /api/agents/{id}/local-config/install` and `POST /api/agents/{id}/local-config/uninstall` endpoints. The `AgentProfilePanel` has NO integration with these endpoints. There are:
- No "Add" buttons on any tab
- No "Remove" buttons on any item
- No install/uninstall handlers
- No mutation callbacks in the props

The `AgentConfigPanel` (Haephestos) DOES have `onRemove` callbacks (ItemChip has remove buttons). The profile panel should have similar affordances for local elements.

---

## Issue 9: Missing LSP Tab or LSP Integration (MINOR)

The design spec lists LSP servers as a discoverable element type, but there is no dedicated LSP tab. They are currently tucked into the Settings tab (lines 216-225). This is acceptable if the number of LSP servers is typically small (0-2), but inconsistent with the pattern of giving each element type its own tab.

---

## Issue 10: AgentConfigPanel (Haephestos) UX Issues

While the primary audit target is `AgentProfilePanel`, the `AgentConfigPanel` has related issues:

1. **No "Create new..." in Haephestos config either:** The config panel displays items added by Haephestos but has no direct add buttons (items come from the Haephestos chat flow). This is acceptable since Haephestos drives the flow, but there should be an `[+ Add manually]` option for each section for power users.

2. **Rules displayed as raw strings:** Rules (lines 269-298) are shown as quoted text strings. No indication of what file they came from or what they do.

3. **No validation feedback:** No indication whether the current configuration is valid/complete enough to create an agent.

---

## Priority Summary

| Priority | Issue | Impact |
|----------|-------|--------|
| P0 | No "Create new..." / "Add" options anywhere | Users cannot add anything to the agent |
| P0 | Role tab missing [Assign Role-Plugin] button and dropdown | Users cannot assign a role to an unassigned agent |
| P0 | Settings tab missing Name, Title, Program, Model, Tags | Critical agent info invisible |
| P1 | No helper text / explanatory guidance anywhere | Users will be confused about purpose and actions |
| P1 | No install/uninstall/remove actions | Panel is view-only, no mutations possible |
| P1 | Manual typing risk when add functionality is implemented | Must plan dropdowns now before implementation |
| P2 | Count badges show nothing for 0 items | Minor confusion about scan state |
| P2 | MCP tab missing connection status | Spec requires it |
| P2 | No Haephestos description/tooltip on Edit button | Users won't understand implications of editing |
| P3 | LSP servers tucked into Settings tab | Inconsistent with tab-per-type pattern |

---

## Recommended Implementation Order

1. **Settings tab restructure** -- add Name, Title, Program, Model, Tags, Role-Plugin toggle
2. **Role tab actions** -- add [Assign Role-Plugin] button with dropdown + "Create new with Haephestos"
3. **Add buttons on all list tabs** -- [+ Add] with dropdown of available items + "Create new..."
4. **Helper text everywhere** -- tooltips, explanatory paragraphs, actionable empty states
5. **Install/Uninstall API integration** -- wire up mutation endpoints
6. **Remove buttons on items** -- allow removing installed elements
7. **Haephestos description accuracy** -- tooltips, labels, correct terminology
8. **MCP connection status** -- requires backend support
9. **Count badges for 0** -- show "0" to distinguish empty from unscanned
