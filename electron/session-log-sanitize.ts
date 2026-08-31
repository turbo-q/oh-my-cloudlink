/**
 * Session logs should keep history even when the live PTY runs `clear`.
 * Strip (and lightly mark) screen-clear / scrollback-erase sequences so
 * replaying logs in xterm does not wipe earlier output.
 */

const CLEAR_MARKER = '\r\n\x1b[90m[screen cleared]\x1b[0m\r\n'

/** Placeholder used only while collapsing adjacent clear sequences. */
const CLEAR_TOKEN = '\u0000CLEAR\u0000'

const HAS_CLEAR_RE = /\x1b\[[0-9;]*J|\x1bc|\x1b\[\??[0-9;]*(?:1049|47)[hl]/

/**
 * Remove ANSI sequences that erase the display or switch alternate screens.
 * Consecutive clears collapse to a single marker line.
 */
export function stripScreenClearSequences(input: string): string {
  if (!input || !HAS_CLEAR_RE.test(input)) return input

  return input
    // Erase in display: CSI n J (0/1/2/3) — `clear` typically sends 2J and/or 3J
    .replace(/\x1b\[[0-9;]*J/g, CLEAR_TOKEN)
    // Full reset (RIS)
    .replace(/\x1bc/g, CLEAR_TOKEN)
    // Alternate screen buffer (enter/leave)
    .replace(/\x1b\[\??[0-9;]*1049[hl]/g, CLEAR_TOKEN)
    .replace(/\x1b\[\??[0-9;]*47[hl]/g, CLEAR_TOKEN)
    // Cursor home / CUP often paired with clear; on replay would overwrite earlier cells
    .replace(/\x1b\[[0-9;]*[Hf]/g, '')
    .replace(new RegExp(`(?:${CLEAR_TOKEN})+`, 'g'), CLEAR_MARKER)
}
