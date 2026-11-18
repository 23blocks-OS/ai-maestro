/**
 * Markdown for A2UI Text on canvas pages (F114). A canvas loads nothing from outside and never leaves the
 * dashboard, so images and links are off; raw HTML stays off (escaped), so the output carries no markup of the agent's.
 */
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: false }).disable(['image', 'link', 'autolink'])

export async function renderCanvasMarkdown(value: string): Promise<string> {
  return md.render(value)
}
