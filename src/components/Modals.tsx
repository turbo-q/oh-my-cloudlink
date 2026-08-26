import { useEffect, useState } from 'react'
import type {
  Host,
  Group,
  SSHKey,
  AuthType,
  DiscoveredKey,
  PortForward,
  PortForwardType,
  Snippet,
} from '../types'
import { GROUP_COLORS, PORT_FORWARD_TYPE_LABELS, isSshHost } from '../types'
import { GroupCombobox } from './GroupCombobox'

function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
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
        aria-label={visible ? '隐藏密码' : '显示密码'}
        title={visible ? '隐藏密码' : '显示密码'}
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
            {host ? '编辑主机' : '添加主机'}
          </h2>
          <button onClick={onClose} className="text-app-muted hover:text-app p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">名称</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="生产服务器"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-app-muted mb-1">主机地址</label>
              <input
                required
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="input-field"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm text-app-muted mb-1">端口</label>
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
            <label className="block text-sm text-app-muted mb-1">用户名</label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-field"
              placeholder="root"
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">认证方式</label>
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
                  {type === 'password' ? '密码' : 'SSH 密钥'}
                </button>
              ))}
            </div>
          </div>

          {form.authType === 'password' ? (
            <div>
              <label className="block text-sm text-app-muted mb-1">密码</label>
              <PasswordInput
                value={form.password}
                onChange={(password) => setForm({ ...form, password })}
                placeholder="••••••••"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-app-muted mb-1">选择密钥</label>
              <select
                value={form.keyId}
                onChange={(e) => setForm({ ...form, keyId: e.target.value })}
                className="input-field"
                required
              >
                <option value="">请选择密钥</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              {keys.length === 0 && (
                <p className="text-xs text-app-subtle mt-1">请先在「密钥管理」中添加 SSH 密钥</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-app-muted mb-1">分组</label>
            <GroupCombobox
              groupId={form.groupId}
              groups={groups}
              onChange={(groupId) => setForm({ ...form, groupId })}
              onCreateGroup={onCreateGroup}
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">标签（逗号分隔）</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="input-field"
              placeholder="生产, web, nginx"
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">备注</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field resize-none h-20"
              placeholder="可选备注信息..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中...' : '保存'}
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
          <h2 className="text-lg font-semibold text-app">{group ? '编辑分组' : '新建分组'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">分组名称</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="生产环境"
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-2">颜色</label>
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
              取消
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中...' : '保存'}
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
      title: '选择 SSH 私钥文件',
      filters: [{ name: 'SSH 密钥', extensions: ['pem', 'key'] }, { name: '所有文件', extensions: ['*'] }],
    })
    if (!files?.[0]) return
    try {
      const key = await window.electronAPI.readKeyFile(files[0])
      setName(key.name)
      setPrivateKey(key.privateKey)
      setPublicKey(key.publicKey ?? '')
    } catch (err) {
      alert(`读取失败: ${(err as Error).message}`)
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
          <h2 className="text-lg font-semibold text-app">{keyItem ? '编辑密钥' : '添加 SSH 密钥'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!keyItem && (
            <button
              type="button"
              onClick={() => void handleImportFromFile()}
              className="btn-secondary w-full text-sm"
            >
              从文件导入私钥
            </button>
          )}
          <div>
            <label className="block text-sm text-app-muted mb-1">密钥名称</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="我的 RSA 密钥"
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">私钥内容</label>
            <textarea
              required
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="input-field font-mono text-xs h-32"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">公钥（可选）</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="input-field font-mono text-xs h-20"
              placeholder="ssh-rsa AAAA..."
            />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">密钥口令（可选）</label>
            <PasswordInput value={passphrase} onChange={setPassphrase} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中...' : '保存'}
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
      alert('请选择尚未导入的密钥')
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
          <h2 className="text-lg font-semibold text-app">发现本机 SSH 密钥</h2>
          <p className="text-xs text-app-subtle mt-1">扫描 ~/.ssh 目录及 config 中的 IdentityFile</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-center text-app-subtle py-8">正在扫描...</p>}
          {error && <p className="text-center text-red-400 py-8">{error}</p>}
          {!loading && !error && discovered.length === 0 && (
            <p className="text-center text-app-subtle py-8">未在 ~/.ssh 中发现私钥文件</p>
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
                            已导入
                          </span>
                        )}
                        {key.publicKey && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            含公钥
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
            取消
          </button>
          <button
            type="button"
            disabled={importing || loading || discovered.length === 0}
            onClick={() => void handleImport()}
            className="btn-primary flex-1"
          >
            {importing ? '导入中...' : `导入选中 (${selected.size})`}
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hostId) {
      alert('请选择主机')
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: forward?.id,
        hostId,
        name: name.trim() || PORT_FORWARD_TYPE_LABELS[type],
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
          <h2 className="text-lg font-semibold text-app">{forward ? '编辑转发规则' : '新建端口转发'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="例如：MySQL / SOCKS 代理"
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">关联主机</label>
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
            <label className="block text-sm text-app-muted mb-2">转发类型</label>
            <div className="flex flex-wrap gap-2">
              {(['local', 'remote', 'dynamic'] as PortForwardType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    type === t
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-app bg-app-hover text-app-muted hover:text-app'
                  }`}
                >
                  {PORT_FORWARD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {type === 'local' && (
            <>
              <p className="text-xs text-app-faint">本机访问本地端口 → 经 SSH 转到远端目标</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">本机地址</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">本机端口</label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className="input-field"
                  />
                  <p className="text-[10px] text-app-faint mt-1">填 0 由系统分配</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">远端目标主机</label>
                  <input
                    required
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    className="input-field"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">远端目标端口</label>
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
              <p className="text-xs text-app-faint">远端机器访问远端端口 → 转到本机服务</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">远端监听地址</label>
                  <input
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.target.value)}
                    className="input-field"
                    placeholder="127.0.0.1 或 0.0.0.0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">远端监听端口</label>
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
                  <label className="block text-sm text-app-muted mb-1">本机目标地址</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">本机目标端口</label>
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
              <p className="text-xs text-app-faint">在本机开启 SOCKS5 代理，流量经 SSH 出口</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-app-muted mb-1">监听地址</label>
                  <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-app-muted mb-1">监听端口</label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(Number(e.target.value))}
                    className="input-field"
                  />
                  <p className="text-[10px] text-app-faint mt-1">常用 1080；填 0 由系统分配</p>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              取消
            </button>
            <button type="submit" disabled={saving || sshHosts.length === 0} className="btn-primary flex-1">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SnippetFormModalProps {
  open: boolean
  snippet?: Snippet | null
  hosts: Host[]
  defaultHostId?: string | null
  onSave: (data: Partial<Snippet> & { name: string; command: string }) => Promise<unknown>
  onClose: () => void
}

export function SnippetFormModal({
  open,
  snippet,
  hosts,
  defaultHostId,
  onSave,
  onClose,
}: SnippetFormModalProps) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [scopeAll, setScopeAll] = useState(true)
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([])
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (snippet) {
      setName(snippet.name)
      setCommand(snippet.command)
      const ids = snippet.hostIds ?? []
      setScopeAll(ids.length === 0)
      setSelectedHostIds(ids)
      setTags(snippet.tags.join(', '))
      return
    }
    setName('')
    setCommand('')
    if (defaultHostId && hosts.some((h) => h.id === defaultHostId)) {
      setScopeAll(false)
      setSelectedHostIds([defaultHostId])
    } else {
      setScopeAll(true)
      setSelectedHostIds([])
    }
    setTags('')
  }, [open, snippet, defaultHostId, hosts])

  if (!open) return null

  const toggleHost = (id: string) => {
    setSelectedHostIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) {
      alert('请填写命令内容')
      return
    }
    if (!scopeAll && selectedHostIds.length === 0) {
      alert('请至少选择一台主机，或改为「全部主机可用」')
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: snippet?.id,
        name: name.trim() || command.trim().slice(0, 40),
        command: command.replace(/\r\n/g, '\n'),
        hostIds: scopeAll ? [] : selectedHostIds,
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
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
          <h2 className="text-lg font-semibold text-app">{snippet ? '编辑命令片段' : '新建命令片段'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="例如：查看 Docker / Nginx 日志"
            />
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">命令内容</label>
            <textarea
              required
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="input-field font-mono text-xs h-36"
              placeholder={'cd /var/log\ntail -f nginx/error.log'}
            />
            <p className="text-[10px] text-app-faint mt-1">
              可用 {'{{hostname}}'} / {'{{hostName}}'} / {'{{username}}'} 占位符
            </p>
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-2">作用范围</label>
            <p className="text-[11px] text-app-faint mb-2">
              只决定「在哪些主机的终端选择器里能看到这条」；插入时仍只写入你指定的那一个 SSH 标签。
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-app cursor-pointer">
                <input
                  type="radio"
                  checked={scopeAll}
                  onChange={() => {
                    setScopeAll(true)
                    setSelectedHostIds([])
                  }}
                />
                全部主机可用
              </label>
              <label className="flex items-center gap-2 text-sm text-app cursor-pointer">
                <input
                  type="radio"
                  checked={!scopeAll}
                  onChange={() => setScopeAll(false)}
                />
                仅以下主机（可多选）
              </label>
            </div>
            {!scopeAll && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-app p-2 space-y-1">
                {hosts.length === 0 ? (
                  <p className="text-xs text-app-subtle px-1 py-2">暂无主机</p>
                ) : (
                  hosts.map((h) => (
                    <label
                      key={h.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer ${
                        selectedHostIds.includes(h.id) ? 'bg-emerald-500/10' : 'hover:bg-app-hover'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedHostIds.includes(h.id)}
                        onChange={() => toggleHost(h.id)}
                      />
                      <span className="text-app truncate">{h.name}</span>
                      <span className="text-xs text-app-faint truncate">
                        {h.username}@{h.hostname}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-app-muted mb-1">标签（逗号分隔，可选）</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input-field"
              placeholder="docker, 日志"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
