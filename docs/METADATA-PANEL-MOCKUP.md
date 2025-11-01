# Agent Metadata Panel - Visual Mockup

## Desktop Layout (1440px+)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                   [☰] [📊] [+] │
├────────────┬─────────────────────────────────────────────────┬─────────────────────────┤
│            │                                                 │                         │
│  SIDEBAR   │                MAIN CONTENT                     │   METADATA PANEL        │
│  (280px)   │                (flex-1)                         │   (400px, resizable)    │
│            │                                                 │                         │
│ ┌────────┐ │  ┌─────────────────────────────────────────┐  │ ┌─────────────────────┐ │
│ │ 🦇 APPS│ │  │ [Terminal] [Messages] [Metadata]        │  │ │ AGENT IDENTITY      │ │
│ │        │ │  ├─────────────────────────────────────────┤  │ │ ┌────┐              │ │
│ │ notify │ │  │                                         │  │ │ │ 🦇 │ Batman       │ │
│ │        │ │  │                                         │  │ │ └────┘              │ │
│ │ ● batman│ │ │                                         │  │ │ apps-notify-batman  │ │
│ │   email │ │  │                                         │  │ │ @jpelaez · notify   │ │
│ │   sms   │ │  │        TERMINAL CONTENT                 │  │ ├─────────────────────┤ │
│ └────────┘ │  │                                         │  │ │ 🟢 ACTIVE · 2.3h    │ │
│            │  │                                         │  │ ├─────────────────────┤ │
│ 🎯 FLUIDM. │  │                                         │  │ │                     │ │
│            │  │                                         │  │ │ ▼ WORK CONTEXT      │ │
│ ● architect│  │                                         │  │ │   Model:            │ │
│ ● frontend │  │                                         │  │ │   [claude-4.5    ▼] │ │
│            │  │                                         │  │ │                     │ │
│            │  └─────────────────────────────────────────┘  │ │   Program:          │ │
│            │                                                 │ │   fluidmind-notify  │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │   Task:             │ │
│            │                                                 │ │   [Email service]   │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │   Tags:             │ │
│            │                                                 │ │   [backend] [email] │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │ ▼ PERFORMANCE       │ │
│            │                                                 │ │ ┌─────┬──────────┐  │ │
│            │                                                 │ │ │📊 47│💬 1,234  │  │ │
│            │                                                 │ │ │Sess │Messages  │  │ │
│            │                                                 │ │ │+5↑  │+12% ↑    │  │ │
│            │                                                 │ │ ├─────┼──────────┤  │ │
│            │                                                 │ │ │✅ 23│⏱️  1.2s  │  │ │
│            │                                                 │ │ │Done │Response  │  │ │
│            │                                                 │ │ │100% │-0.3s ↓   │  │ │
│            │                                                 │ │ └─────┴──────────┘  │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │ ▶ COST & USAGE      │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │ ▶ DOCUMENTATION     │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │ ▶ CUSTOM METADATA   │ │
│            │                                                 │ │                     │ │
│            │                                                 │ │ ▼ NOTES             │ │
│            │                                                 │ │ [Textarea...]       │ │
│            │                                                 │ └─────────────────────┘ │
│            │                                                 │         ↕               │
│            │                                                 │    [Collapse →]         │
└────────────┴─────────────────────────────────────────────────┴─────────────────────────┘
```

**Key Features:**
- **Resizable:** Drag left edge to adjust width (280-600px)
- **Collapsible:** Click arrow to collapse to 48px icon bar
- **Scrollable:** Panel scrolls independently when content overflows
- **Persistent:** Width and collapse state saved to localStorage

---

## Collapsed State (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                           [☰] [📊] [+] │
├────────────┬──────────────────────────────────────────────────────┬──────────┤
│            │                                                      │          │
│  SIDEBAR   │              MAIN CONTENT (FULL WIDTH)               │  PANEL   │
│  (280px)   │                                                      │  (48px)  │
│            │                                                      │          │
│ ┌────────┐ │  ┌────────────────────────────────────────────────┐ │ ┌──────┐ │
│ │ 🦇 APPS│ │  │ [Terminal] [Messages]                          │ │ │  📊  │ │
│ │        │ │  ├────────────────────────────────────────────────┤ │ │      │ │
│ │ notify │ │  │                                                │ │ │  🔧  │ │
│ │        │ │  │                                                │ │ │      │ │
│ │ ● batman│ │  │                                                │ │ │  📈  │ │
│ │   email │ │  │                                                │ │ │      │ │
│ │   sms   │ │  │        TERMINAL CONTENT                        │ │ │  💰  │ │
│ └────────┘ │  │        (MORE SPACE)                            │ │ │      │ │
│            │  │                                                │ │ │  📄  │ │
│ 🎯 FLUIDM. │  │                                                │ │ │      │ │
│            │  │                                                │ │ │  ⚙️   │ │
│ ● architect│  │                                                │ │ │      │ │
│ ● frontend │  │                                                │ │ │  📝  │ │
│            │  │                                                │ │ │      │ │
│            │  └────────────────────────────────────────────────┘ │ └──────┘ │
│            │                                                      │    ↕     │
│            │                                                      │ [← Open] │
└────────────┴──────────────────────────────────────────────────────┴──────────┘
```

**Icon Legend (Vertical Buttons):**
- 📊 = Identity (scroll to top)
- 🔧 = Work Context
- 📈 = Performance
- 💰 = Cost & Usage
- 📄 = Documentation
- ⚙️ = Custom Metadata
- 📝 = Notes

**Click any icon:** Panel expands and scrolls to that section

---

## Mobile Layout (<1024px) - Bottom Sheet

```
┌─────────────────────────────────────┐
│ [☰] AI Maestro          [📊] [+]    │  ← Header (fixed)
├─────────────────────────────────────┤
│                                     │
│     MAIN CONTENT (FULL SCREEN)      │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ [Terminal] [Messages]       │   │
│  ├─────────────────────────────┤   │
│  │                             │   │
│  │                             │   │
│  │     TERMINAL CONTENT        │   │
│  │                             │   │
│  │                             │   │
│  │                             │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│         [Tap for metadata ↑]        │  ← Fixed button (floats above content)
│                                     │
└─────────────────────────────────────┘
```

### When Bottom Sheet Opens:

```
┌─────────────────────────────────────┐
│                                     │
│     DIMMED BACKGROUND               │  ← 50% opacity overlay
│     (TAP TO CLOSE)                  │
│                                     │
├─────────────────────────────────────┤  ← Drag handle
│ ═══════════════════════════════════ │
│                                     │
│ 🦇 Batman                           │  ← Panel slides up from bottom
│ apps-notify-batman                  │
│ @jpelaez · notify team              │
├─────────────────────────────────────┤
│ 🟢 ACTIVE · 2.3h                    │
├─────────────────────────────────────┤
│                                     │
│ ▼ WORK CONTEXT                      │
│   Model: claude-sonnet-4.5          │
│   Program: fluidmind-notify         │
│   Task: Email notification service  │
│   Tags: [backend] [email]           │
│                                     │
│ ▼ PERFORMANCE                       │
│ ┌───────────┬────────────┐          │
│ │ 📊 47     │ 💬 1,234   │          │
│ │ Sessions  │ Messages   │          │
│ └───────────┴────────────┘          │
│                                     │
│ ▶ COST & USAGE                      │
│ ▶ DOCUMENTATION                     │
│ ▶ CUSTOM METADATA                   │
│                                     │
│      [Scroll for more ↓]            │
└─────────────────────────────────────┘
```

**Mobile Interactions:**
- **Tap dark overlay** → Close panel
- **Drag handle down** → Close panel
- **Swipe down** → Close panel
- **Scroll inside panel** → View all content (60vh height)

---

## Inline Editing States

### View State (Hover)

```
┌────────────────────────────────────────┐
│ ▼ WORK CONTEXT                         │
│                                        │
│   Model:                         [✏️]  │  ← Edit icon on hover
│   claude-sonnet-4.5                    │
│   ────────────────────────────────     │  ← Underline on hover
│                                        │
│   Program:                       [✏️]  │
│   fluidmind-notify                     │
│                                        │
└────────────────────────────────────────┘
```

### Edit State (Click)

```
┌────────────────────────────────────────┐
│ ▼ WORK CONTEXT                         │
│                                        │
│   Model:                          [⏳] │  ← Saving indicator
│   ┌──────────────────────────────┐    │
│   │ claude-sonnet-4.5          ▼ │    │  ← Dropdown opened
│   ├──────────────────────────────┤    │
│   │ › claude-sonnet-4.5          │    │  ← Selected
│   │   claude-haiku-3.5           │    │
│   │   gpt-4-turbo                │    │
│   │   gpt-3.5-turbo              │    │
│   └──────────────────────────────┘    │
│                                        │
│   Program:                             │
│   fluidmind-notify                     │
│                                        │
└────────────────────────────────────────┘
```

### Save State (Success)

```
┌────────────────────────────────────────┐
│ ▼ WORK CONTEXT                         │
│                                        │
│   Model:                          [✓]  │  ← Green checkmark (2s)
│   gpt-4-turbo                          │  ← Value updated
│   ────────────────────────────────     │  ← Brief green underline
│                                        │
│   Program:                             │
│   fluidmind-notify                     │
│                                        │
└────────────────────────────────────────┘
```

### Error State

```
┌────────────────────────────────────────┐
│ ▼ WORK CONTEXT                         │
│                                        │
│   Model:                          [⚠️]  │  ← Red warning icon
│   claude-sonnet-4.5                    │  ← Reverted to previous value
│   ────────────────────────────────     │  ← Red underline
│   ⚠ Failed to save. Try again.        │  ← Error message (5s)
│                                        │
└────────────────────────────────────────┘
```

---

## Performance Metrics - Expanded View

```
┌──────────────────────────────────────────────────────┐
│ ▼ PERFORMANCE                                        │
│                                                      │
│ ┌───────────────────────┬───────────────────────┐   │
│ │ 📊                    │ 💬                    │   │
│ │ 47                    │ 1,234                 │   │  ← Large numbers
│ │ Sessions              │ Messages              │   │  ← Labels
│ │ ┌───────────────────┐ │ ┌───────────────────┐ │   │
│ │ │ +5 this week    ↑ │ │ │ +12% vs last wk ↑ │ │   │  ← Trend badges
│ │ └───────────────────┘ │ └───────────────────┘ │   │
│ ├───────────────────────┼───────────────────────┤   │
│ │ ✅                    │ ⏱️                     │   │
│ │ 23                    │ 1.2s                  │   │
│ │ Tasks Completed       │ Avg Response Time     │   │
│ │ ┌───────────────────┐ │ ┌───────────────────┐ │   │
│ │ │ 100% success ✓    │ │ │ -0.3s faster   ↓  │ │   │
│ │ └───────────────────┘ │ └───────────────────┘ │   │
│ └───────────────────────┴───────────────────────┘   │
│                                                      │
│ Uptime History (24h)                                 │
│ 23.4 hrs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%        │  ← Sparkline
│          ⎺⎺⎺⎺⎺⎺⎽⎽⎽⎽⎽───────                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Visual Hierarchy:**
1. **Icons** (top-left, 24px) → Quick recognition
2. **Values** (center, 32px bold) → Primary metric
3. **Labels** (below value, 12px muted) → Context
4. **Trends** (bottom, badge) → Change over time
5. **Sparklines** (optional) → Historical pattern

---

## Custom Metadata Section

```
┌──────────────────────────────────────────────────────┐
│ ▼ CUSTOM METADATA                                    │
│                                                      │
│ ┌──────────────────┬─────────────────────────────┐  │
│ │ Key              │ Value                    [×] │  │  ← Edit inline
│ ├──────────────────┼─────────────────────────────┤  │
│ │ oncall_rotation  │ jpelaez                  [×] │  │
│ │ sla_tier         │ p1                       [×] │  │
│ │ deploy_env       │ production               [×] │  │
│ │ team_channel     │ #notify-alerts           [×] │  │
│ └──────────────────┴─────────────────────────────┘  │
│                                                      │
│ [+ Add custom field]                                 │  ← New row button
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Adding New Field:

```
┌──────────────────────────────────────────────────────┐
│ ▼ CUSTOM METADATA                                    │
│                                                      │
│ ┌──────────────────┬─────────────────────────────┐  │
│ │ Key              │ Value                    [×] │  │
│ ├──────────────────┼─────────────────────────────┤  │
│ │ oncall_rotation  │ jpelaez                  [×] │  │
│ │ sla_tier         │ p1                       [×] │  │
│ │ ┌──────────────┐ │ ┌───────────────────────┐  │  │  ← New row (edit mode)
│ │ │ key_name     │ │ │ value                 │  │  │
│ │ └──────────────┘ │ └───────────────────────┘  │  │
│ └──────────────────┴─────────────────────────────┘  │
│                                                      │
│ [+ Add custom field]                                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Interactions:**
- **Click "+ Add custom field"** → New row appears in edit mode
- **Type key + value** → Auto-saves on blur
- **Click [×]** → Confirm deletion modal
- **Double-click existing row** → Edit mode

---

## Responsive Breakpoints

### Desktop (>1440px)
- Sidebar: 280px (fixed)
- Main: flex-1
- Metadata Panel: 400px (default, resizable 280-600px)

### Laptop (1024-1439px)
- Sidebar: 280px (fixed)
- Main: flex-1
- Metadata Panel: 320px (default, resizable 280-400px)
- **Or:** Panel collapsed by default (user can expand)

### Tablet Landscape (768-1023px)
- Sidebar: Overlay (hamburger menu)
- Main: 100%
- Metadata Panel: Bottom sheet (slide up, 60vh)

### Mobile Portrait (<768px)
- Sidebar: Full-screen overlay
- Main: 100%
- Metadata Panel: Bottom sheet (slide up, 70vh)

---

## Animation Timing

```css
/* Panel expand/collapse */
.metadata-panel {
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Section accordion */
.section-content {
  transition: max-height 200ms ease-out,
              opacity 150ms ease-out;
}

/* Inline edit focus */
.field-input:focus {
  transition: background-color 150ms ease,
              border-color 150ms ease,
              box-shadow 150ms ease;
}

/* Save state indicator */
.save-icon {
  animation: fadeInOut 2000ms ease;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: scale(0.8); }
  20% { opacity: 1; transform: scale(1); }
  80% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
}

/* Bottom sheet (mobile) */
.bottom-sheet {
  transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bottom-sheet.open {
  transform: translateY(0);
}
.bottom-sheet.closed {
  transform: translateY(100%);
}
```

---

## Color Coding (Status-Based)

```typescript
// Agent Status Colors
const statusColors = {
  active: {
    bg: 'rgba(34, 197, 94, 0.1)',    // Green
    border: 'rgb(34, 197, 94)',
    text: 'rgb(134, 239, 172)',
    icon: 'rgb(74, 222, 128)',
  },
  idle: {
    bg: 'rgba(234, 179, 8, 0.1)',    // Yellow
    border: 'rgb(234, 179, 8)',
    text: 'rgb(253, 224, 71)',
    icon: 'rgb(250, 204, 21)',
  },
  disconnected: {
    bg: 'rgba(107, 114, 128, 0.1)',  // Gray
    border: 'rgb(107, 114, 128)',
    text: 'rgb(209, 213, 219)',
    icon: 'rgb(156, 163, 175)',
  },
}

// Metric Trend Colors
const trendColors = {
  positive: 'rgb(34, 197, 94)',    // Green ↑
  negative: 'rgb(239, 68, 68)',    // Red ↓
  neutral: 'rgb(156, 163, 175)',   // Gray →
}

// Performance Threshold Colors (response time example)
const performanceColors = {
  excellent: 'rgb(34, 197, 94)',   // <1s = green
  good: 'rgb(234, 179, 8)',        // 1-2s = yellow
  poor: 'rgb(239, 68, 68)',        // >2s = red
}
```

---

## Accessibility Features

### Focus Indicators

```
┌──────────────────────────────────────────────────────┐
│ ▼ WORK CONTEXT                                       │
│                                                      │
│   Model:                                             │
│   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓    │  ← Blue outline (focus)
│   ┃ claude-sonnet-4.5                          ┃    │
│   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Screen Reader Announcements

```html
<!-- Live region for save status -->
<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
  Field "model" saved successfully
</div>

<!-- Section accordion state -->
<button
  aria-expanded="true"
  aria-controls="work-context-content"
  id="work-context-header"
>
  Work Context
</button>
<div
  id="work-context-content"
  role="region"
  aria-labelledby="work-context-header"
>
  <!-- Section content -->
</div>

<!-- Metric cards with semantic info -->
<div
  role="group"
  aria-label="Total sessions: 47, increased by 5 this week"
>
  <span aria-hidden="true">47</span>
  <span class="sr-only">Total sessions: 47, increased by 5 this week</span>
</div>
```

### Keyboard Shortcuts

```
Global Shortcuts:
├─ Cmd/Ctrl + Shift + I  → Toggle metadata panel
├─ Cmd/Ctrl + Shift + M  → Focus metadata panel (if open)
└─ Escape                → Close panel (if focused)

Within Panel:
├─ Tab                   → Navigate to next field
├─ Shift + Tab           → Navigate to previous field
├─ Space                 → Toggle section (when header focused)
├─ Enter                 → Activate edit mode (when field focused)
├─ Escape                → Cancel edit (revert changes)
└─ Arrow keys            → Navigate dropdown options
```

---

## Empty States

### No Metadata Yet

```
┌──────────────────────────────────────────────────────┐
│ ▼ CUSTOM METADATA                                    │
│                                                      │
│            ┌──────────────────────────┐             │
│            │                          │             │
│            │     [⚙️]                 │             │
│            │                          │             │
│            │  No custom metadata yet  │             │
│            │                          │             │
│            │  Add fields to track     │             │
│            │  agent-specific info     │             │
│            │                          │             │
│            │  [+ Add first field]     │             │
│            │                          │             │
│            └──────────────────────────┘             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Loading State

```
┌──────────────────────────────────────────────────────┐
│ 🦇 Batman                                            │
│ apps-notify-batman                                   │
│ @jpelaez · notify team                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│            ┌──────────────────────────┐             │
│            │                          │             │
│            │     [⏳]                 │             │
│            │                          │             │
│            │  Loading metadata...     │             │
│            │                          │             │
│            └──────────────────────────┘             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Error State

```
┌──────────────────────────────────────────────────────┐
│ 🦇 Batman                                            │
│ apps-notify-batman                                   │
│ @jpelaez · notify team                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│            ┌──────────────────────────┐             │
│            │                          │             │
│            │     [⚠️]                 │             │
│            │                          │             │
│            │  Failed to load          │             │
│            │  metadata                │             │
│            │                          │             │
│            │  [Retry]                 │             │
│            │                          │             │
│            └──────────────────────────┘             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Implementation Notes

### Component Structure

```
components/
├─ AgentMetadataPanel/
│  ├─ index.tsx                    # Main panel container
│  ├─ AgentIdentity.tsx            # Header with avatar/name
│  ├─ StatusBanner.tsx             # Active/idle status
│  ├─ WorkContextSection.tsx       # Model, program, task, tags
│  ├─ PerformanceSection.tsx       # Metrics cards
│  ├─ CostUsageSection.tsx         # API calls, tokens, cost
│  ├─ DocumentationSection.tsx     # Docs links
│  ├─ CustomMetadataSection.tsx    # Key-value editor
│  ├─ NotesSection.tsx             # Text area (existing)
│  ├─ MetricCard.tsx               # Reusable metric component
│  ├─ InlineEditField.tsx          # Reusable edit pattern
│  └─ SectionAccordion.tsx         # Collapsible section wrapper
```

### State Management

```typescript
// Panel state (global)
const [panelState, setPanelState] = useLocalStorage('metadata-panel-state', 'open')
const [panelWidth, setPanelWidth] = useLocalStorage('metadata-panel-width', 400)

// Section expand state (per agent)
const [expandedSections, setExpandedSections] = useLocalStorage(
  `metadata-sections-${agentId}`,
  new Set(['identity', 'work-context', 'performance', 'notes'])
)

// Edit state (component-local)
const [editingField, setEditingField] = useState<string | null>(null)
const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
```

### API Endpoints

```typescript
// GET agent metadata
GET /api/agents/:id
Response: {
  id, alias, displayName, avatar,
  owner, team, program, model, taskDescription, tags,
  description, runbook, wiki, notes, relatedLinks,
  totalSessions, totalMessages, totalTasksCompleted,
  uptimeHours, averageResponseTime,
  totalApiCalls, totalTokensUsed, estimatedCost,
  customMetadata: { [key: string]: any }
}

// PATCH update agent (any field)
PATCH /api/agents/:id
Body: { [field]: value }
Response: { success: true, agent: {...} }

// POST custom metadata field
POST /api/agents/:id/metadata
Body: { key: string, value: any }

// DELETE custom metadata field
DELETE /api/agents/:id/metadata/:key
```

---

**This mockup represents the recommended implementation based on UX research findings. Review and approve before Day 1 implementation begins.**
