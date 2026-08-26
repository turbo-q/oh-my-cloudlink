/** Normalize IPC / Node transfer errors into localized short messages. */
export function formatTransferError(err: unknown, t: (key: string) => string): string {
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

  raw = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (code === 'ENOSPC' || /ENOSPC|no space left on device/i.test(raw)) {
    return t('files.errNoSpace')
  }
  if (code === 'EACCES' || code === 'EPERM' || /EACCES|EPERM|permission denied/i.test(raw)) {
    return t('files.errPermission')
  }
  if (code === 'ENOENT' || /ENOENT|no such file/i.test(raw)) {
    return t('files.errNotFound')
  }
  if (code === 'ENOTDIR' || /ENOTDIR/i.test(raw)) {
    return t('files.errNotDir')
  }
  if (code === 'EEXIST' || /EEXIST|already exists/i.test(raw)) {
    return t('files.errExists')
  }
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|handshake/i.test(raw)) {
    return t('files.errNetwork')
  }
  if (/No such file|Failure/i.test(raw) && /sftp|ssh/i.test(raw)) {
    return t('files.errRemoteOp')
  }

  return raw || t('files.errUnknown')
}
