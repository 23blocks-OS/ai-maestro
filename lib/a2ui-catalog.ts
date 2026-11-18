/**
 * The locked A2UI component set for canvas pages (F114). Same id as the v1.0 basic catalog, so agents write the
 * standard catalogId, but without Image, Video, AudioPlayer (outside URLs) and the openUrl function.
 * Kept apart from lib/a2ui-canvas.ts because it loads the A2UI library (Lit web components).
 */
import { Catalog } from '@a2ui/web_core'
import {
  A2uiText, A2uiIcon, A2uiRow, A2uiColumn, A2uiList, A2uiCard, A2uiTabs, A2uiModal, A2uiDivider,
  A2uiButton, A2uiTextField, A2uiCheckBox, A2uiChoicePicker, A2uiSlider, A2uiDateTimeInput,
  BASIC_FUNCTIONS, basicCatalog,
} from '@a2ui/web_core/catalogs/basic/v1'
import { A2UI_ALLOWED_COMPONENTS, A2UI_BLOCKED_FUNCTIONS } from './a2ui-canvas'

export const canvasCatalog = new Catalog(
  basicCatalog.id,
  '1.0',
  [A2uiText, A2uiIcon, A2uiRow, A2uiColumn, A2uiList, A2uiCard, A2uiTabs, A2uiModal, A2uiDivider,
    A2uiButton, A2uiTextField, A2uiCheckBox, A2uiChoicePicker, A2uiSlider, A2uiDateTimeInput]
    .filter(c => A2UI_ALLOWED_COMPONENTS.has(c.name)),
  BASIC_FUNCTIONS.filter(f => !A2UI_BLOCKED_FUNCTIONS.has(f.name)),
)
