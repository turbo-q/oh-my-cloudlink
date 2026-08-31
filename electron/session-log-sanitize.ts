/**
 * Session logs should keep history even when the live PTY runs `clear`.
 * Strip (and lightly mark) screen-clear / scrollback-erase sequences so
 * replaying logs in xterm does not wipe earlier output.
 *
 * PTY data often arrives in arbitrary chunks, so incomplete ESC/CSI tails are
 * buffered across pushes until the sequence completes (or is flushed).
 */

const CLEAR_MARKER = '\r\n\x1b[90m[screen cleared]\x1b[0m\r\n'

/** Placeholder used only while collapsing adjacent clear sequences. */
const CLEAR_TOKEN = '\u0000CLEAR\u0000'

const HAS_CLEAR_RE = /\x1b\[[0-9;]*J|\x1bc|\x1b\[\??[0-9;]*(?:1049|47)[hl]/

/** Incomplete ESC / CSI at end of a chunk (no final byte yet). */
const INCOMPLETE_ESC_TAIL_RE = /\x1b(?:\[[0-9;?]*)?$/

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

/**
 * Stateful sanitizer for streaming PTY chunks.
 * Holds a trailing incomplete ESC/CSI until the next chunk completes it.
 */
export class ScreenClearSanitizer {
  private pending = ''

  /** Feed the next chunk; returns sanitized text ready to append (may be empty). */
  push(chunk: string): string {
    if (!chunk && !this.pending) return ''

    const combined = this.pending + chunk
    this.pending = ''

    const incomplete = combined.match(INCOMPLETE_ESC_TAIL_RE)
    let complete = combined
    if (incomplete && incomplete.index != null) {
      this.pending = incomplete[0]
      complete = combined.slice(0, incomplete.index)
    }

    return stripScreenClearSequences(complete)
  }

  /** Flush any held bytes (e.g. session end). */
  flush(): string {
    if (!this.pending) return ''
    const out = stripScreenClearSequences(this.pending)
    this.pending = ''
    return out
  }
}
