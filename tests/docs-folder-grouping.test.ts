/**
 * Tests for the docs-tab folder grouping (components/DocumentationPanel.tsx).
 *
 * The reported symptom: subfolders and their files showed in the Docs tab, but
 * root-level files like CLAUDE.md appeared to be missing.
 *
 * They were indexed and present in the data the whole time. The grouping
 * stripped only the agent's registered `workingDirectory` from each file path.
 * When that drifted from the `project_path` the documents were actually
 * indexed under — observed on a real agent registered at
 * `/blocks/jarvis/api` whose docs were indexed under `/blocks/jarvis/v2` —
 * the prefix never matched, the path stayed ABSOLUTE, and because an absolute
 * path always contains '/', the `(root)` bucket was never produced at all.
 * CLAUDE.md was filed under a folder row literally named
 * "/Users/.../jarvis/v2" instead of "Root".
 *
 * This mirrors the grouping logic so the behaviour is pinned without mounting
 * the component.
 */

import { describe, it, expect } from 'vitest'

interface Doc {
  filePath: string
  projectPath?: string
}

/** Mirrors documentsByFolder in DocumentationPanel.tsx. */
function groupByFolder(documents: Doc[], workingDirectory?: string): Record<string, string[]> {
  return documents.reduce((acc, doc) => {
    const base = doc.projectPath || workingDirectory
    let relativePath = doc.filePath
    let matched = false
    if (base && doc.filePath.startsWith(base)) {
      relativePath = doc.filePath.slice(base.length).replace(/^\//, '')
      matched = true
    }

    const parts = relativePath.split('/')
    let folderPath: string
    if (parts.length <= 1) folderPath = '(root)'
    else if (matched) folderPath = parts.slice(0, -1).join('/')
    else folderPath = parts[parts.length - 2] || '(root)'

    ;(acc[folderPath] ||= []).push(parts[parts.length - 1])
    return acc
  }, {} as Record<string, string[]>)
}

const REPO = '/Users/me/repo'

describe('docs folder grouping', () => {
  it('puts root-level files under (root)', () => {
    const g = groupByFolder(
      [
        { filePath: `${REPO}/CLAUDE.md`, projectPath: REPO },
        { filePath: `${REPO}/README.md`, projectPath: REPO },
        { filePath: `${REPO}/docs/setup.md`, projectPath: REPO },
      ],
      REPO
    )
    expect(g['(root)']).toEqual(['CLAUDE.md', 'README.md'])
    expect(g['docs']).toEqual(['setup.md'])
  })

  it('keeps nested folders intact', () => {
    const g = groupByFolder([{ filePath: `${REPO}/docs/api/auth.md`, projectPath: REPO }], REPO)
    expect(g['docs/api']).toEqual(['auth.md'])
  })

  it('REGRESSION: still finds root files when workingDirectory has drifted', () => {
    // The real failure. The agent is registered at /jarvis/api but its docs
    // were indexed under /jarvis/v2. Grouping must follow the document's own
    // project_path, not the stale prop.
    const INDEXED = '/Users/me/blocks/jarvis/v2'
    const REGISTERED = '/Users/me/blocks/jarvis/api'

    const g = groupByFolder(
      [
        { filePath: `${INDEXED}/CLAUDE.md`, projectPath: INDEXED },
        { filePath: `${INDEXED}/docs/api.md`, projectPath: INDEXED },
      ],
      REGISTERED
    )

    expect(g['(root)']).toEqual(['CLAUDE.md'])
    expect(g['docs']).toEqual(['api.md'])
    // The old behaviour produced a folder named after the absolute path.
    expect(Object.keys(g).some((k) => k.startsWith('/'))).toBe(false)
  })

  it('never labels a folder with an absolute path when no base matches', () => {
    // Neither project_path nor workingDirectory available or matching: fall
    // back to the immediate parent directory so the list stays readable.
    const g = groupByFolder([{ filePath: '/somewhere/else/deep/notes.md' }], undefined)
    expect(Object.keys(g)).toEqual(['deep'])
    expect(Object.keys(g).some((k) => k.startsWith('/'))).toBe(false)
  })

  it('treats a bare filename as root', () => {
    expect(groupByFolder([{ filePath: 'CLAUDE.md' }], REPO)['(root)']).toEqual(['CLAUDE.md'])
  })

  it('renders folders and root files separately, like a normal file browser', () => {
    // Root-level files are NOT a folder. The list shows real folders
    // (alphabetical) and then the root files as plain top-level rows — no
    // pseudo-folder to expand, matching Finder / VS Code / GitHub.
    const g = groupByFolder(
      [
        { filePath: `${REPO}/CLAUDE.md`, projectPath: REPO },
        { filePath: `${REPO}/zebra/z.md`, projectPath: REPO },
        { filePath: `${REPO}/docs/a.md`, projectPath: REPO },
      ],
      REPO
    )

    const folderKeys = Object.keys(g).filter((k) => k !== '(root)').sort()
    const rootFiles = g['(root)'] || []

    expect(folderKeys).toEqual(['docs', 'zebra'])
    expect(rootFiles).toEqual(['CLAUDE.md'])
    // No pseudo-folder leaks into the folder list.
    expect(folderKeys).not.toContain('(root)')
  })
})
