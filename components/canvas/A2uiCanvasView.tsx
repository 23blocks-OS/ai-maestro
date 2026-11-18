'use client'

/**
 * Renders an A2UI canvas page (F114) with our locked component set, no iframe. Loaded only when an
 * `.a2ui.json` page is opened (next/dynamic in CanvasPanel), so the library costs nothing otherwise.
 */
import { useEffect, useMemo, useState } from 'react'
import { MessageProcessor } from '@a2ui/web_core'
import { injectBasicCatalogStyles } from '@a2ui/web_core/catalogs/basic/v1'
import { A2uiSurface, MarkdownContext } from '@a2ui/react'
import { renderCanvasMarkdown } from '@/lib/a2ui-markdown'
// The Icon component draws Material Icons glyphs; served from our bundle, since a canvas loads nothing from outside
import 'material-icons/iconfont/filled.css'
import { checkA2uiMessages, parseA2uiMessages, type A2uiAction } from '@/lib/a2ui-canvas'
import { canvasCatalog } from '@/lib/a2ui-catalog'

// The dashboard's dark theme, through the basic catalog's CSS variables
const THEME: React.CSSProperties = {
  ['--a2ui-color-background' as string]: '#111827',
  ['--a2ui-color-surface' as string]: '#1f2937',
  ['--a2ui-color-on-background' as string]: '#f3f4f6',
  ['--a2ui-color-on-surface' as string]: '#f3f4f6',
  ['--a2ui-color-border' as string]: '#374151',
  ['--a2ui-color-input' as string]: '#111827',
  ['--a2ui-color-on-input' as string]: '#f3f4f6',
  ['--a2ui-color-primary' as string]: '#06b6d4',
  ['--a2ui-color-on-primary' as string]: '#082f49',
  ['--a2ui-color-primary-hover' as string]: '#22d3ee',
  ['--a2ui-color-secondary' as string]: '#374151',
  ['--a2ui-color-on-secondary' as string]: '#e5e7eb',
  ['--a2ui-color-secondary-hover' as string]: '#374151',
}

export default function A2uiCanvasView({ text, fileName, onAction }: {
  text: string
  fileName: string
  onAction: (action: A2uiAction) => void
}) {
  useEffect(() => { injectBasicCatalogStyles() }, [])

  const { processor, error } = useMemo(() => {
    try {
      const messages = parseA2uiMessages(text, fileName)
      const problems = checkA2uiMessages(messages)
      if (problems.length) return { processor: null, error: problems.join('\n') }
      const p = new MessageProcessor([canvasCatalog], a => onAction(a as A2uiAction))
      p.processMessages(messages as never)
      return { processor: p, error: null }
    } catch (e) {
      return { processor: null, error: (e as Error).message }
    }
    // onAction is read through the closure; a new file text is what rebuilds the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fileName])

  useEffect(() => () => processor?.dispose(), [processor])

  const [surfaces, setSurfaces] = useState(() => (processor ? Array.from(processor.getSurfaces().values()) : []))
  useEffect(() => {
    if (!processor) { setSurfaces([]); return }
    const sync = () => setSurfaces(Array.from(processor.getSurfaces().values()))
    sync()
    const a = processor.onSurfaceCreated(sync)
    const b = processor.onSurfaceDeleted(sync)
    return () => { a.unsubscribe(); b.unsubscribe() }
  }, [processor])

  if (error) {
    return (
      <div role="alert" className="m-4 p-3 rounded-lg border border-red-800 bg-red-900/30 text-sm text-red-300 whitespace-pre-wrap" data-testid="a2ui-error">
        This page could not be shown:{'\n'}{error}
      </div>
    )
  }
  return (
    <div className="w-full h-full overflow-auto p-4 space-y-4" style={THEME} data-testid="a2ui-canvas">
      {surfaces.length === 0 && <p className="text-sm text-gray-500">The page has no surface yet (a createSurface message is missing).</p>}
      <MarkdownContext.Provider value={renderCanvasMarkdown}>
        {surfaces.map(s => <A2uiSurface key={s.id} surface={s as never} />)}
      </MarkdownContext.Provider>
    </div>
  )
}
