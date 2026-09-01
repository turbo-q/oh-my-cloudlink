import type { Terminal } from 'xterm'
import { WebglAddon } from '@xterm/addon-webgl'

/**
 * Attach WebGL renderer with silent DOM/Canvas fallback on failure or context loss.
 * Do not call clearTextureAtlas() — atlas is shared across terminals with the same config.
 */
export function attachTerminalWebgl(term: Terminal): () => void {
  let addon: WebglAddon | null = null
  try {
    addon = new WebglAddon()
    addon.onContextLoss(() => {
      try {
        addon?.dispose()
      } catch {
        // ignore
      }
      addon = null
    })
    // @xterm/addon-webgl types target @xterm/xterm; runtime is compatible with `xterm` 5.x.
    term.loadAddon(addon as unknown as Parameters<Terminal['loadAddon']>[0])
  } catch (err) {
    console.warn('[terminal] WebGL addon unavailable, using default renderer', err)
    try {
      addon?.dispose()
    } catch {
      // ignore
    }
    addon = null
  }

  return () => {
    try {
      addon?.dispose()
    } catch {
      // ignore
    }
    addon = null
  }
}
