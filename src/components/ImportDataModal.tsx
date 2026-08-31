import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import type {
  ImportConflict,
  ImportEntityCounts,
  ImportMode,
  ImportPreviewResult,
  ImportPreviewSampleItem,
} from '../types/import'
import { countPreviewItems } from '../types/import'

interface ImportDataModalProps {
  open: boolean
  loading?: boolean
  preview: ImportPreviewResult | null
  mode: ImportMode
  conflict: ImportConflict
  onModeChange: (mode: ImportMode) => void
  onConflictChange: (conflict: ImportConflict) => void
  onConfirm: () => void
  onCancel: () => void
}

const COUNT_KEYS: (keyof ImportEntityCounts)[] = [
  'hosts',
  'groups',
  'keys',
  'portForwards',
  'snippets',
]

const COUNT_KIND: Record<keyof ImportEntityCounts, ImportPreviewSampleItem['kind']> = {
  hosts: 'host',
  groups: 'group',
  keys: 'key',
  portForwards: 'forward',
  snippets: 'snippet',
}

function kindLabel(t: (key: string) => string, kind: ImportPreviewSampleItem['kind']): string {
  return t(`import.kind.${kind}`)
}

function formatCountBreakdown(
  t: (key: string) => string,
  counts: ImportEntityCounts,
): string {
  return COUNT_KEYS.filter((key) => counts[key] > 0)
    .map((key) => `${kindLabel(t, COUNT_KIND[key])} ${counts[key]}`)
    .join(t('import.countSep'))
}

function PreviewSection({
  title,
  counts,
  items,
  t,
}: {
  title: string
  counts: ImportEntityCounts
  items: ImportPreviewSampleItem[]
  t: (key: string, params?: Record<string, number>) => string
}) {
  const total = countPreviewItems(counts)
  if (total === 0) return null

  const breakdown = formatCountBreakdown(t, counts)

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-app">{title}</p>
        {breakdown && <p className="text-xs text-app-muted mt-0.5">{breakdown}</p>}
      </div>
      <ul className="space-y-1 pl-3 border-l border-app-strong">
        {items.map((item, i) => (
          <li key={`${item.kind}-${item.label}-${i}`} className="text-sm text-app truncate">
            <span className="text-app-muted">{kindLabel(t, item.kind)} · </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImportPreviewBody({
  preview,
  mode,
  t,
}: {
  preview: ImportPreviewResult
  mode: ImportMode
  t: (key: string, params?: Record<string, number>) => string
}) {
  if (mode === 'replace') {
    const total = countPreviewItems(preview.incoming)
    if (total === 0) return <p className="text-sm text-app-muted">{t('import.previewEmpty')}</p>
    return (
      <PreviewSection
        title={t('import.previewReplaceTitle', { n: total })}
        counts={preview.incoming}
        items={preview.samples.add}
        t={t}
      />
    )
  }

  const addTotal = countPreviewItems(preview.add)
  const updateTotal = countPreviewItems(preview.update)
  const skipTotal = countPreviewItems(preview.skip)

  if (addTotal + updateTotal + skipTotal === 0) {
    return <p className="text-sm text-app-muted">{t('import.previewEmpty')}</p>
  }

  return (
    <div className="space-y-4">
      <PreviewSection
        title={t('import.sampleAddTitle', { n: addTotal })}
        counts={preview.add}
        items={preview.samples.add}
        t={t}
      />
      <PreviewSection
        title={t('import.sampleUpdateTitle', { n: updateTotal })}
        counts={preview.update}
        items={preview.samples.update}
        t={t}
      />
      <PreviewSection
        title={t('import.sampleSkipTitle', { n: skipTotal })}
        counts={preview.skip}
        items={preview.samples.skip}
        t={t}
      />
    </div>
  )
}

export function ImportDataModal({
  open,
  loading = false,
  preview,
  mode,
  conflict,
  onModeChange,
  onConflictChange,
  onConfirm,
  onCancel,
}: ImportDataModalProps) {
  const { t } = useI18n()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) setSubmitting(false)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-app-strong shrink-0">
          <h2 className="text-lg font-semibold text-app">{t('import.title')}</h2>
          <p className="text-sm text-app-muted mt-2">{t('import.subtitle')}</p>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto min-h-0">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-app-muted mb-1">{t('import.modeLabel')}</legend>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="mt-1"
                checked={mode === 'merge'}
                onChange={() => onModeChange('merge')}
              />
              <span>
                <span className="text-sm font-medium text-app block">{t('import.modeMerge')}</span>
                <span className="text-xs text-app-muted">{t('import.modeMergeDesc')}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="mt-1"
                checked={mode === 'replace'}
                onChange={() => onModeChange('replace')}
              />
              <span>
                <span className="text-sm font-medium text-app block">{t('import.modeReplace')}</span>
                <span className="text-xs text-app-muted">{t('import.modeReplaceDesc')}</span>
              </span>
            </label>
          </fieldset>

          {mode === 'merge' && (
            <fieldset className="space-y-3 pl-1 border-l-2 border-app-strong ml-1">
              <legend className="text-sm font-medium text-app-muted mb-1 px-2">
                {t('import.conflictLabel')}
              </legend>
              <label className="flex items-start gap-3 cursor-pointer px-2">
                <input
                  type="radio"
                  name="import-conflict"
                  className="mt-1"
                  checked={conflict === 'skip'}
                  onChange={() => onConflictChange('skip')}
                />
                <span>
                  <span className="text-sm font-medium text-app block">{t('import.conflictSkip')}</span>
                  <span className="text-xs text-app-muted">{t('import.conflictSkipDesc')}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer px-2">
                <input
                  type="radio"
                  name="import-conflict"
                  className="mt-1"
                  checked={conflict === 'update'}
                  onChange={() => onConflictChange('update')}
                />
                <span>
                  <span className="text-sm font-medium text-app block">{t('import.conflictUpdate')}</span>
                  <span className="text-xs text-app-muted">{t('import.conflictUpdateDesc')}</span>
                </span>
              </label>
            </fieldset>
          )}

          <div className="rounded-lg bg-app-card border border-app-strong px-4 py-3">
            <p className="text-xs font-medium text-app-muted uppercase tracking-wider mb-2">
              {t('import.previewLabel')}
            </p>
            {loading && !preview ? (
              <p className="text-sm text-app-muted">{t('common.loading')}</p>
            ) : preview ? (
              <div className="max-h-64 overflow-y-auto pr-1">
                <ImportPreviewBody preview={preview} mode={mode} t={t} />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmitting(true)
                onConfirm()
              }}
              className="btn-primary"
              disabled={submitting || loading || !preview}
            >
              {submitting ? t('common.saving') : t('import.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
