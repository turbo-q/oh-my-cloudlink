/** Persist last local browse path across LocalFilePane remounts (e.g. browse → session). */
let lastLocalPath: string | null = null

export function getLastLocalPath(): string | null {
  return lastLocalPath
}

export function setLastLocalPath(path: string): void {
  if (path) lastLocalPath = path
}
