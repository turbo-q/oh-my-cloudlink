import { useEffect, useState } from 'react'
import type { Host, Group, SSHKey, AuthType, DiscoveredKey } from '../types'
import { DEFAULT_FTP_PORT, DEFAULT_SSH_PORT, GROUP_COLORS } from '../types'

interface HostFormModalProps {
  open: boolean
  host?: Host | null
  groups: Group[]
  keys: SSHKey[]
  onSave: (data: Partial<Host> & { name: string; hostname: string; username: string }) => Promise<unknown>
  onClose: () => void
}

const emptyForm = {
  name: '',
  hostname: '',
  port: 22,
  username: 'root',
  isFtpServer: false,
  authType: 'password' as AuthType,
  password: '',
  keyId: '',
  groupId: '',
  tags: '',
  notes: '',
}

export function HostFormModal({ open, host, groups, keys, onSave, onClose }: HostFormModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (host) {
      setForm({
        name: host.name,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        isFtpServer: host.protocol === 'ftp',
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
        protocol: form.isFtpServer ? 'ftp' : 'ssh',
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

  const isFtp = form.isFtpServer

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {host ? '编辑主机' : '添加主机'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">名称</label>
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
              <label className="block text-sm text-slate-400 mb-1">主机地址</label>
              <input
                required
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="input-field"
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">端口</label>
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
            <label className="block text-sm text-slate-400 mb-1">用户名</label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-field"
              placeholder="root"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
            <input
              type="checkbox"
              checked={form.isFtpServer}
              onChange={(e) => {
                const isFtpServer = e.target.checked
                setForm({
                  ...form,
                  isFtpServer,
                  port: isFtpServer ? DEFAULT_FTP_PORT : DEFAULT_SSH_PORT,
                  authType: isFtpServer ? 'password' : form.authType,
                })
              }}
              className="mt-0.5 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span>
              <span className="block text-sm text-slate-300">这是 FTP 服务器</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                普通 SSH 主机无需勾选，SFTP 传输在顶部「SFTP」菜单中直接使用
              </span>
            </span>
          </label>

          {isFtp && (
            <div className="text-xs text-amber-400/80 bg-amber-400/10 rounded-lg px-3 py-2">
              FTP 仅支持密码认证，文件传输不加密（建议优先使用 SFTP）
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">认证方式</label>
            <div className="flex gap-2">
              {(['password', 'key'] as AuthType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={isFtp && type === 'key'}
                  onClick={() => setForm({ ...form, authType: type })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    form.authType === type
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  {type === 'password' ? '密码' : 'SSH 密钥'}
                </button>
              ))}
            </div>
          </div>

          {form.authType === 'password' ? (
            <div>
              <label className="block text-sm text-slate-400 mb-1">密码</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field"
                placeholder="••••••••"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-slate-400 mb-1">选择密钥</label>
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
                <p className="text-xs text-slate-500 mt-1">请先在「密钥管理」中添加 SSH 密钥</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">分组</label>
            <select
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              className="input-field"
            >
              <option value="">无分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">标签（逗号分隔）</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="input-field"
              placeholder="生产, web, nginx"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">备注</label>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{group ? '编辑分组' : '新建分组'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">分组名称</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="生产环境"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">颜色</label>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{keyItem ? '编辑密钥' : '添加 SSH 密钥'}</h2>
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
            <label className="block text-sm text-slate-400 mb-1">密钥名称</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="我的 RSA 密钥"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">私钥内容</label>
            <textarea
              required
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="input-field font-mono text-xs h-32"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">公钥（可选）</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="input-field font-mono text-xs h-20"
              placeholder="ssh-rsa AAAA..."
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">密钥口令（可选）</label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="input-field"
            />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d27] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">发现本机 SSH 密钥</h2>
          <p className="text-xs text-slate-500 mt-1">扫描 ~/.ssh 目录及 config 中的 IdentityFile</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-center text-slate-500 py-8">正在扫描...</p>}
          {error && <p className="text-center text-red-400 py-8">{error}</p>}
          {!loading && !error && discovered.length === 0 && (
            <p className="text-center text-slate-500 py-8">未在 ~/.ssh 中发现私钥文件</p>
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
                        : 'border-white/5 bg-white/5 hover:bg-white/10'
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
                        <span className="text-sm font-medium text-white">{key.name}</span>
                        {imported && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                            已导入
                          </span>
                        )}
                        {key.publicKey && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                            含公钥
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{key.filePath}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
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
