import { useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import type { Host, Snippet } from '../types'
import { formatSnippetScope } from '../utils/snippets'

interface SnippetsPanelProps {
  hosts: Host[]
  snippets: Snippet[]
  onAdd: () => void
  onEdit: (snippet: Snippet) => void
  onDelete: (snippet: Snippet) => void
}

export function SnippetsPanel({ hosts, snippets, onAdd, onEdit, onDelete }: SnippetsPanelProps) {
  const { t } = useI18n()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...snippets]
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q) ||
          s.tags.some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [snippets, query])

  const toggleSearch = () => {
    setSearchOpen((open) => {
      const next = !open
      if (next) {
        requestAnimationFrame(() => searchRef.current?.focus())
      } else {
        setQuery('')
      }
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col page-shell min-h-0">
      <div className="page-header px-8 py-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-app">{t('snippets.title')}</h2>
            <p className="text-sm text-app-subtle mt-1">{t('snippets.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleSearch}
              className={`p-2 rounded-lg border transition-colors ${
                searchOpen
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-app text-app-muted hover:text-app hover:bg-app-hover'
              }`}
              title={t('snippets.searchToggle')}
              aria-label={t('snippets.searchToggle')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              {t('snippets.new')}
            </button>
          </div>
        </div>

        {searchOpen && (
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('snippets.search')}
            className="input-field w-full max-w-md"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {snippets.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">{t('snippets.empty')}</p>
            <p className="text-sm text-app-faint mb-6">{t('snippets.emptyHint')}</p>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              {t('snippets.new')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">{t('snippets.noMatch')}</div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {visible.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onEdit(s)
                  }
                }}
                className="panel-card rounded-xl px-5 py-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:border-app-emphasis cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-app">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover text-app-muted">
                        {formatSnippetScope(s, hosts, {
                          allHosts: t('snippets.scopeAll'),
                          unknown: t('common.unknownHost'),
                          more: (names, n) => t('snippets.scopeMore', { names, n }),
                        })}
                      </span>
                      {s.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/90"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <pre className="mt-2 text-xs font-mono text-app-muted whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                      {s.command}
                    </pre>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button className="inline-action" onClick={() => onEdit(s)}>
                      {t('common.edit')}
                    </button>
                    <button className="inline-action-danger" onClick={() => onDelete(s)}>
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 max-w-4xl rounded-xl border border-app-strong bg-app-card/60 p-5 text-sm text-app-subtle space-y-2">
          <p className="text-app-muted font-medium">{t('snippets.helpTitle')}</p>
          <p>{t('snippets.helpScope')}</p>
          <p>{t('snippets.helpRun')}</p>
          <p>{t('snippets.helpShortcut')}</p>
        </div>
      </div>
    </div>
  )
}
