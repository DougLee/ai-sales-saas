import React from 'react'
import { parseEntityUrl, dispatchEntityNavigate } from './entity-links.js'

function renderInline(text: string, baseKey: string): React.JSX.Element {
  const parts: React.ReactNode[] = []
  const regex = /(\[.*?\]\(.*?\)|`[^`]+`|\*\*.*?\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const m = match[0]
    if (m.startsWith('[')) {
      const linkMatch = m.match(/^\[(.*?)\]\((.*?)\)$/)
      if (linkMatch) {
        const entityRef = parseEntityUrl(linkMatch[2])
        if (entityRef) {
          parts.push(
            <button
              key={`${baseKey}-e-${match.index}`}
              type="button"
              onClick={() => dispatchEntityNavigate(entityRef)}
              className="text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover hover:decoration-solid"
            >
              {linkMatch[1]}
            </button>
          )
        } else {
          parts.push(
            <a
              key={`${baseKey}-l-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary-hover"
            >
              {linkMatch[1]}
            </a>
          )
        }
      } else {
        parts.push(m)
      }
    } else if (m.startsWith('`')) {
      parts.push(
        <code
          key={`${baseKey}-c-${match.index}`}
          className="rounded bg-background px-1 py-0.5 text-xs font-mono text-primary"
        >
          {m.slice(1, -1)}
        </code>
      )
    } else if (m.startsWith('**')) {
      parts.push(
        <strong key={`${baseKey}-b-${match.index}`} className="font-semibold">
          {m.slice(2, -2)}
        </strong>
      )
    }
    lastIndex = match.index + m.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <span key={baseKey}>{parts}</span>
}

export function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.JSX.Element[] = []
  let inTable = false
  let tableRows: string[] = []
  let listItems: string[] = []
  let inList = false
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockLines: string[] = []
  let inQuote = false
  let quoteLines: string[] = []
  let key = 0

  const flushTable = () => {
    if (tableRows.length === 0) return
    const header = tableRows[0]
    const body = tableRows.slice(2)
    const headers = header.split('|').map((h) => h.trim()).filter(Boolean)
    const k = key++
    elements.push(
      <div key={`table-${k}`} className="my-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-2 text-left text-xs font-semibold text-text-secondary">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {body.map((row, ri) => {
              const cells = row.split('|').map((c) => c.trim()).filter(Boolean)
              return (
                <tr key={ri} className="hover:bg-surface-elevated/50">
                  {cells.map((c, ci) => (
                    <td key={ci} className="px-4 py-2 text-text-primary">{c}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
    inTable = false
  }

  const flushList = () => {
    if (listItems.length === 0) return
    const k = key++
    elements.push(
      <ul key={`list-${k}`} className="my-3 ml-5 list-disc space-y-1.5 text-sm text-text-primary">
        {listItems.map((item, i) => {
          const text = item.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '')
          return (
            <li key={i} className="leading-relaxed">
              {renderInline(text, `list-${k}-i-${i}`)}
            </li>
          )
        })}
      </ul>
    )
    listItems = []
    inList = false
  }

  const flushCodeBlock = () => {
    if (!inCodeBlock) return
    const code = codeBlockLines.join('\n')
    const k = key++
    elements.push(
      <div key={`code-${k}`} className="my-3 rounded-lg bg-background border border-border overflow-hidden">
        {codeBlockLang && (
          <div className="px-3 py-1 text-[10px] font-medium text-text-tertiary bg-surface-elevated border-b border-border">
            {codeBlockLang}
          </div>
        )}
        <pre className="overflow-x-auto p-3 text-xs font-mono text-text-primary">
          <code>{code}</code>
        </pre>
      </div>
    )
    inCodeBlock = false
    codeBlockLang = ''
    codeBlockLines = []
  }

  const flushQuote = () => {
    if (!inQuote) return
    const k = key++
    elements.push(
      <blockquote key={`quote-${k}`} className="my-3 border-l-4 border-primary/30 pl-3 py-1 text-sm text-text-secondary italic">
        {quoteLines.join('\n')}
      </blockquote>
    )
    inQuote = false
    quoteLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // 代码块围栏
    if (trimmed.startsWith('```')) {
      flushTable()
      flushList()
      flushQuote()
      if (inCodeBlock) {
        flushCodeBlock()
      } else {
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
      }
      continue
    }
    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    // 引用块
    if (trimmed.startsWith('> ')) {
      flushTable()
      flushList()
      if (!inQuote) inQuote = true
      quoteLines.push(trimmed.slice(2))
      continue
    } else if (inQuote) {
      flushQuote()
    }

    // 表格
    if (trimmed.startsWith('|')) {
      if (!inTable) {
        flushList()
        inTable = true
      }
      tableRows.push(trimmed)
      continue
    } else if (inTable) {
      flushTable()
    }

    // 列表
    if (trimmed.match(/^[-*]\s/) || trimmed.match(/^\d+\.\s/)) {
      if (!inList) inList = true
      listItems.push(trimmed)
      continue
    } else if (inList && trimmed === '') {
      flushList()
      continue
    } else if (inList) {
      flushList()
    }

    // 空行
    if (trimmed === '') {
      elements.push(<div key={`br-${key++}`} className="h-2" />)
      continue
    }

    // 分隔线
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      elements.push(<hr key={`hr-${key++}`} className="my-4 border-border" />)
      continue
    }

    // 标题与段落
    const k = key++
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h2-${k}`} className="mt-4 mb-2 text-lg font-semibold text-text-primary">
          {renderInline(trimmed.slice(2), `h2-${k}`)}
        </h2>
      )
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h3-${k}`} className="mt-3 mb-1.5 text-base font-semibold text-text-primary">
          {renderInline(trimmed.slice(3), `h3-${k}`)}
        </h3>
      )
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h4-${k}`} className="mt-2 mb-1 text-sm font-semibold text-text-primary">
          {renderInline(trimmed.slice(4), `h4-${k}`)}
        </h4>
      )
    } else {
      elements.push(
        <p key={`p-${k}`} className="my-2 text-sm text-text-primary leading-relaxed">
          {renderInline(trimmed, `p-${k}`)}
        </p>
      )
    }
  }

  flushTable()
  flushList()
  flushCodeBlock()
  flushQuote()
  return elements
}
