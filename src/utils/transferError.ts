/** Normalize IPC / Node transfer errors into short Chinese messages for the status bar. */
export function formatTransferError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : ''

  let raw = ''
  if (err instanceof Error) raw = err.message
  else if (typeof err === 'string') raw = err
  else if (err && typeof err === 'object' && 'message' in err) {
    raw = String((err as { message: unknown }).message)
  } else {
    raw = String(err)
  }

  // Electron invoke wrapper: Error invoking remote method 'file:download': ...
  raw = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (code === 'ENOSPC' || /ENOSPC|no space left on device/i.test(raw)) {
    return '磁盘空间不足，无法继续写入'
  }
  if (code === 'EACCES' || code === 'EPERM' || /EACCES|EPERM|permission denied/i.test(raw)) {
    return '没有文件读写权限'
  }
  if (code === 'ENOENT' || /ENOENT|no such file/i.test(raw)) {
    return '文件或目录不存在'
  }
  if (code === 'ENOTDIR' || /ENOTDIR/i.test(raw)) {
    return '路径不是有效目录'
  }
  if (code === 'EEXIST' || /EEXIST|already exists/i.test(raw)) {
    return '目标已存在'
  }
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|handshake/i.test(raw)) {
    return '网络连接中断或超时'
  }
  if (/No such file|Failure/i.test(raw) && /sftp|ssh/i.test(raw)) {
    return '远程文件操作失败'
  }

  return raw || '未知错误'
}
