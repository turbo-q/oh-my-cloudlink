export interface CellMetrics {
  width: number
  height: number
}

export interface NativeTermBinding {
  isAvailable(): boolean
  loadError(): string | null
  attach(windowHandle: Buffer): void
  detach(): void
  setBounds(x: number, y: number, width: number, height: number, scaleFactor: number): void
  setVisible(visible: boolean): void
  focus(): void
  createSession(sessionId: string, cols: number, rows: number): void
  destroySession(sessionId: string): void
  setActiveSession(sessionId: string | null): void
  writeOutput(sessionId: string, data: string): void
  scrollToBottom(sessionId: string): void
  resizeSession(sessionId: string, cols: number, rows: number): void
  getCellMetrics(): CellMetrics
  setInputCallback(callback: (sessionId: string, data: string) => void): void
  clearInputCallback(): void
}

declare const binding: NativeTermBinding
export = binding
