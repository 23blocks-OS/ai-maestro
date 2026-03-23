# TomlPreviewPanel Component Report
Created: 2026-03-11

## File
`/Users/emanuelesabetta/ai-maestro/components/TomlPreviewPanel.tsx`

## Implementation
- 'use client' directive, TypeScript
- Props: `tomlPath: string`, `onClose?: () => void`
- Polls `GET /api/agents/creation-helper/toml-preview?path=<encoded>` every 5s via `useCallback` + `setInterval`
- Response shape: `{ content: string, exists: boolean }`
- Header with "Agent Profile Preview" title, RefreshCw icon (spins while loading), optional X close button
- When `exists=false`: centered placeholder text
- When `exists=true`: monospace `<pre>` block, scrollable, read-only
- Dark theme: bg-gray-900, text-gray-200, border-gray-700/800
- Outer div: `flex flex-col h-full` (parent controls width)
- 78 lines total, imports only from react and lucide-react
