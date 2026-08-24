export function getElectronAPI(): NonNullable<Window['electronAPI']> {
  const api = window.electronAPI
  if (!api) {
    throw new Error('请在 Electron 应用中运行（npm run dev），浏览器预览不支持本机文件浏览')
  }
  return api
}

export function assertElectronMethod<K extends keyof NonNullable<Window['electronAPI']>>(
  method: K,
): NonNullable<NonNullable<Window['electronAPI']>[K]> {
  const api = getElectronAPI()
  const fn = api[method]
  if (typeof fn !== 'function') {
    throw new Error(
      `electronAPI.${String(method)} 不可用，请完全退出后重新运行 npm run dev 以加载最新 preload`,
    )
  }
  return fn.bind(api) as NonNullable<NonNullable<Window['electronAPI']>[K]>
}
