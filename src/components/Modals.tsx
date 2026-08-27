import { useEffect, useState } from 'react'
import type {
  Host,
  Group,
  SSHKey,
  AuthType,
  DiscoveredKey,
  PortForward,
  PortForwardType,
} from '../types'
import { GROUP_COLORS, isSshHost } from '../types'
import { GroupCombobox } from './GroupCombobox'
import { useI18n } from '../i18n/I18nProvider'

export { SnippetFormModal } from './SnippetFormModal'

function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  showLabel,
  hideLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  showLabel: string
  hideLabel: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field pr-10"
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-app-muted hover:text-app hover:bg-app-hover"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
      >
        {visible ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

interface HostFormModalProps {
  open: boolean
  host?: Host | null
  groups: Group[]
  keys: SSHKey[]
  onSave: (data: Partial<Host> & { name: string; hostname: string; username: string }) => Promise<unknown>
  onCreateGroup: (name: string) => Promise<Group>
  onClose: () => void
}

const emptyForm = {
  name: '',
  hostname: '',
  port: 22,
  username: 'root',
  authType: 'password' as AuthType,
  password: '',
  keyId: '',
  groupId: '',
  tags: '',
  notes: '',
}

export function HostFormModal({ open, host, groups, keys, onSave, onCreateGroup, onClose }: HostFormModalProps) {
  const { t } = useI18n()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (host) {
      setForm({
        name: host.name,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        authType: host.authType,
        password: host.password ?? '',
        keyId: host.keyId ?? '',
        groupId: host.groupId ?? '',
        tags: host.tags.join(', '),
        notes: host.notes ?? '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [host, open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        id: host?.id,
        name: form.name.trim(),
        hostname: form.hostname.trim(),
        port: form.port,
        username: form.username.trim(),
        protocol: 'ssh',
        authType: form.authType,
        password: form.authType === 'password' ? form.password : undefined,
        keyId: form.authType === 'key' ? form.keyId || undefined : undefined,
        groupId: form.groupId || undefined,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes.trim() || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-strong">
          <h2 className="text-lg font-semibold text-app">
            {host ? t('modal.hostEdit') : t('modal.hostAdd')}
          </h2>
          <button onClick={onClose} className="text-app-muted hover:text-app p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('common.name')}</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder={t('modal.placeholderHostName')}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-app-muted mb-1">{t('modal.labelHostname')}</label>
              <input
                required
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="input-field"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm text-app-muted mb-1">{t('modal.labelPort')}</label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelUsername')}</label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-field"
              placeholder="root"
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelAuth')}</label>
            <div className="flex gap-2">
              {(['password', 'key'] as AuthType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, authType: type })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.authType === type
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-app-hover text-app-muted border border-transparent hover:bg-app-hover-strong'
                  }`}
                >
                  {type === 'password' ? t('modal.authPassword') : t('modal.authKey')}
                </button>
              ))}
            </div>
          </div>

          {form.authType === 'password' ? (
            <div>
              <label className="block text-sm text-app-muted mb-1">{t('modal.labelPassword')}</label>
              <PasswordInput
                value={form.password}
                onChange={(password) => setForm({ ...form, password })}
                placeholder="••••••••"
                showLabel={t('modal.showPassword')}
                hideLabel={t('modal.hidePassword')}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-app-muted mb-1">{t('modal.labelSelectKey')}</label>
              <select
                value={form.keyId}
                onChange={(e) => setForm({ ...form, keyId: e.target.value })}
                className="input-field"
                required
              >
                <option value="">{t('modal.selectKeyPlaceholder')}</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              {keys.length === 0 && (
                <p className="text-xs text-app-subtle mt-1">{t('modal.noKeysHint')}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelGroup')}</label>
            <GroupCombobox
              groupId={form.groupId}
              groups={groups}
              onChange={(groupId) => setForm({ ...form, groupId })}
              onCreateGroup={onCreateGroup}
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelTags')}</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="input-field"
              placeholder={t('modal.placeholderTags')}
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelNotes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field resize-none h-20"
              placeholder={t('modal.placeholderNotes')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('modal.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? t('modal.saving') : t('modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface GroupFormModalProps {
  open: boolean
  group?: Group | null
  onSave: (data: Partial<Group> & { name: string; color: string }) => Promise<unknown>
  onClose: () => void
}

export function GroupFormModal({ open, group, onSave, onClose }: GroupFormModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setColor(group.color)
    } else {
      setName('')
      setColor(GROUP_COLORS[0])
    }
  }, [group, open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ id: group?.id, name: name.trim(), color })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="px-6 py-4 border-b border-app-strong">
          <h2 className="text-lg font-semibold text-app">{group ? t('modal.groupEdit') : t('modal.groupNew')}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelGroupName')}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder={t('modal.placeholderGroupName')}
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-2">{t('modal.labelColor')}</label>
            <div className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('modal.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? t('modal.saving') : t('modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface KeyFormModalProps {
  open: boolean
  keyItem?: SSHKey | null
  onSave: (data: Partial<SSHKey> & { name: string; privateKey: string }) => Promise<unknown>
  onClose: () => void
}

export function KeyFormModal({ open, keyItem, onSave, onClose }: KeyFormModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (keyItem) {
      setName(keyItem.name)
      setPrivateKey(keyItem.privateKey)
      setPublicKey(keyItem.publicKey ?? '')
      setPassphrase(keyItem.passphrase ?? '')
    } else {
      setName('')
      setPrivateKey('')
      setPublicKey('')
      setPassphrase('')
    }
  }, [keyItem, open])

  const handleImportFromFile = async () => {
    const files = await window.electronAPI.openFileDialog({
      title: t('modal.dialogSelectKey'),
      filters: [
        { name: t('modal.filterSshKey'), extensions: ['pem', 'key'] },
        { name: t('modal.filterAllFiles'), extensions: ['*'] },
      ],
    })
    if (!files?.[0]) return
    try {
      const key = await window.electronAPI.readKeyFile(files[0])
      setName(key.name)
      setPrivateKey(key.privateKey)
      setPublicKey(key.publicKey ?? '')
    } catch (err) {
      alert(t('modal.readFail', { message: (err as Error).message }))
    }
  }

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        id: keyItem?.id,
        name: name.trim(),
        privateKey: privateKey.trim(),
        publicKey: publicKey.trim() || undefined,
        passphrase: passphrase.trim() || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-app-strong">
          <h2 className="text-lg font-semibold text-app">{keyItem ? t('modal.keyEdit') : t('modal.keyNew')}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!keyItem && (
            <button
              type="button"
              onClick={() => void handleImportFromFile()}
              className="btn-secondary w-full text-sm"
            >
              {t('modal.importFromFile')}
            </button>
          )}
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelKeyName')}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder={t('modal.placeholderKeyName')}
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelPrivateKey')}</label>
            <textarea
              required
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="input-field font-mono text-xs h-32"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelPublicKey')}</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="input-field font-mono text-xs h-20"
              placeholder="ssh-rsa AAAA..."
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelPassphrase')}</label>
            <PasswordInput
              value={passphrase}
              onChange={setPassphrase}
              showLabel={t('modal.showPassword')}
              hideLabel={t('modal.hidePassword')}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('modal.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? t('modal.saving') : t('modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface DiscoverKeysModalProps {
  open: boolean
  existingKeys: SSHKey[]
  onImport: (keys: DiscoveredKey[]) => Promise<unknown>
  onClose: () => void
}

export function DiscoverKeysModal({ open, existingKeys, onImport, onClose }: DiscoverKeysModalProps) {
  const { t } = useI18n()
  const [discovered, setDiscovered] = useState<DiscoveredKey[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)
    setSelected(new Set())

    void window.electronAPI
      .discoverLocalKeys()
      .then((keys) => {
        setDiscovered(keys)
        setSelected(new Set(keys.map((k) => k.filePath)))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const toggle = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }

  const isImported = (key: DiscoveredKey) =>
    existingKeys.some(
      (k) => k.privateKey === key.privateKey || k.name === key.name || k.name === key.filePath,
    )

  const handleImport = async () => {
    const toImport = discovered.filter((k) => selected.has(k.filePath) && !isImported(k))
    if (toImport.length === 0) {
      alert(t('modal.selectKeysAlert'))
      return
    }

    setImporting(true)
    try {
      await onImport(toImport)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-app-strong shrink-0">
          <h2 className="text-lg font-semibold text-app">{t('modal.discoverTitle')}</h2>
          <p className="text-xs text-app-subtle mt-1">{t('modal.discoverHint')}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-center text-app-subtle py-8">{t('modal.scanning')}</p>}
          {error && <p className="text-center text-red-400 py-8">{error}</p>}
          {!loading && !error && discovered.length === 0 && (
            <p className="text-center text-app-subtle py-8">{t('modal.noKeysFound')}</p>
          )}
          {!loading && discovered.length > 0 && (
            <div className="space-y-2">
              {discovered.map((key) => {
                const imported = isImported(key)
                return (
                  <label
                    key={key.filePath}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(key.filePath)
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-app bg-app-hover hover:bg-app-hover-strong'
                    } ${imported ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key.filePath)}
                      disabled={imported}
                      onChange={() => toggle(key.filePath)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-app">{key.name}</span>
                        {imported && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-app-muted">
                            {t('modal.imported')}
                          </span>
                        )}
                        {key.publicKey && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            {t('modal.hasPublicKey')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-app-subtle truncate mt-0.5">{key.filePath}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-app-strong flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            {t('modal.cancel')}
          </button>
          <button
            type="button"
            disabled={importing || loading || discovered.length === 0}
            onClick={() => void handleImport()}
            className="btn-primary flex-1"
          >
            {importing ? t('modal.importing') : t('modal.importSelected', { n: selected.size })}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PortForwardFormModalProps {
  open: boolean
  forward?: PortForward | null
  hosts: Host[]
  defaultHostId?: string | null
  onSave: (
    data: Partial<PortForward> & {
      hostId: string
      name: string
      type: PortForwardType
      localHost: string
      localPort: number
    },
  ) => Promise<unknown>
  onClose: () => void
}

export function PortForwardFormModal({
  open,
  forward,
  hosts,
  defaultHostId,
  onSave,
  onClose,
}: PortForwardFormModalProps) {
  const { t } = useI18n()
  const sshHosts = hosts.filter(isSshHost)
  const [name, setName] = useState('')
  const [hostId, setHostId] = useState('')
  const [type, setType] = useState<PortForwardType>('local')
  const [localHost, setLocalHost] = useState('127.0.0.1')
  const [localPort, setLocalPort] = useState(18080)
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState(80)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const available = hosts.filter(isSshHost)
    if (forward) {
      setName(forward.name)
      setHostId(forward.hostId)
      setType(forward.type)
      setLocalHost(forward.localHost || '127.0.0.1')
      setLocalPort(forward.localPort)
      setRemoteHost(forward.remoteHost || '127.0.0.1')
      setRemotePort(forward.remotePort || 80)
      return
    }
    setName('')
    setHostId(
      defaultHostId && available.some((h) => h.id === defaultHostId)
        ? defaultHostId
        : available[0]?.id ?? '',
    )
    setType('local')
    setLocalHost('127.0.0.1')
    setLocalPort(18080)
    setRemoteHost('127.0.0.1')
    setRemotePort(80)
  }, [open, forward, defaultHostId, hosts])

  if (!open) return null

  const forwardTypeLabel = (forwardType: PortForwardType) => {
    if (forwardType === 'local') return t('forwards.typeLocal')
    if (forwardType === 'remote') return t('forwards.typeRemote')
    return t('forwards.typeDynamic')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hostId) {
      alert(t('modal.selectHostAlert'))
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: forward?.id,
        hostId,
        name: name.trim() || forwardTypeLabel(type),
        type,
        localHost: localHost.trim() || '127.0.0.1',
        localPort: Number(localPort) || 0,
        remoteHost: type === 'dynamic' ? undefined : remoteHost.trim(),
        remotePort: type === 'dynamic' ? undefined : Number(remotePort) || undefined,
      })
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-app-strong">
          <h2 className="text-lg font-semibold text-app">{forward ? t('modal.forwardEdit') : t('modal.forwardNew')}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">{t('common.name')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder={t('modal.placeholderForwardName')}
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">{t('modal.labelLinkedHost')}</label>
            <select
              required
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="input-field"
            >
              {sshHosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.username}@{h.hostname})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-2">{t('modal.labelForwardType')}</label>
            <div className="flex flex-wrap gap-2">
              {(['local', 'remote', 'dynamic'] as PortForwardType[]).map((forwardType) => (
                <button
                  key={forwardType}
                  type="button"
                  onClick={() => setType(forwardType)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    type === forwardType
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-app bg-app-hover text-app-muted hover:text-app'
                  }`}
                >
                  {forwardTypeLabel(forwardType)}
                </button>
              ))}
            </div>
          </div>

          {type === 'local' && (
            <>
              <p className="text-xs text-app-faint">{t('modal.localHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelLocalHost')}</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelLocalPort')}</label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className="input-field"
                  />
                  <p className="text-[10px] text-app-faint mt-1">{t('modal.portAutoHint')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelRemoteTargetHost')}</label>
                  <input
                    required
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    className="input-field"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelRemoteTargetPort')}</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={remotePort}
                    onChange={(e) => setRemotePort(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
            </>
          )}

          {type === 'remote' && (
            <>
              <p className="text-xs text-app-faint">{t('modal.remoteHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelRemoteListenHost')}</label>
                  <input
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    className="input-field"
                    placeholder={t('modal.placeholderRemoteListen')}
                  />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelRemoteListenPort')}</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={remotePort}
                    onChange={(e) => setRemotePort(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelLocalTargetHost')}</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelLocalTargetPort')}</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
            </>
          )}

          {type === 'dynamic' && (
            <>
              <p className="text-xs text-app-faint">{t('modal.dynamicHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelListenHost')}</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">{t('modal.labelListenPort')}</label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className="input-field"
                  />
                  <p className="text-[10px] text-app-faint mt-1">{t('modal.dynamicPortHint')}</p>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('modal.cancel')}
            </button>
            <button type="submit" disabled={saving || sshHosts.length === 0} className="btn-primary flex-1">
              {saving ? t('modal.saving') : t('modal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
