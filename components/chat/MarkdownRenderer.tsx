'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md transition-colors ${
        copied
          ? 'bg-green-600/20 text-green-400'
          : 'bg-gray-700/50 text-gray-400 hover:text-gray-200 active:bg-gray-600/50'
      } ${className}`}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative group my-1">
      <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
        {language && (
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {language}
          </span>
        )}
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 rounded-md px-3 py-2 pr-9 overflow-x-auto text-xs font-mono text-gray-200 select-text">
        {code}
      </pre>
    </div>
  )
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[4]) {
      parts.push(
        <code key={key++} className="bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-blue-300">
          {match[4]}
        </code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

function renderMarkdown(text: string): JSX.Element {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang: string | undefined
  let codeKey = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const code = codeLines.join('\n')
        elements.push(<CodeBlock key={`code-${codeKey++}`} code={code} language={codeLang} />)
        codeLines = []
        codeLang = undefined
        inCodeBlock = false
      } else {
        inCodeBlock = true
        const lang = line.slice(3).trim()
        codeLang = lang || undefined
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const headerText = headerMatch[2]
      const className = level === 1
        ? 'text-base font-bold mt-3 mb-1'
        : level === 2
        ? 'text-sm font-semibold mt-2 mb-1'
        : 'text-sm font-medium mt-1.5 mb-0.5'
      elements.push(
        <div key={i} className={className}>
          {renderInline(headerText)}
        </div>
      )
      continue
    }

    // Bullet list items
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-gray-500 flex-shrink-0">&#x2022;</span>
          <span>{renderInline(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      )
      continue
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-gray-500 flex-shrink-0">{numberedMatch[1]}.</span>
          <span>{renderInline(numberedMatch[2])}</span>
        </div>
      )
      continue
    }

    // Regular line
    if (line.trim()) {
      elements.push(
        <p key={i} className="whitespace-pre-wrap">
          {renderInline(line)}
        </p>
      )
    } else {
      elements.push(<div key={i} className="h-2" />)
    }
  }

  // Close unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    const code = codeLines.join('\n')
    elements.push(<CodeBlock key={`code-${codeKey}`} code={code} language={codeLang} />)
  }

  return <>{elements}</>
}

export function MarkdownContent({ text }: { text: string }) {
  return <div className="text-sm break-words">{renderMarkdown(text)}</div>
}
