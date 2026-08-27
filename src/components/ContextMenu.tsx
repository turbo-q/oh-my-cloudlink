import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const padding = 8
    let left = x
    let top = y

    if (left + rect.width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - rect.width - padding)
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - rect.height - padding)
    }

    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [x, y, items])

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[168px] py-1 rounded-lg border border-app-strong bg-elevated shadow-xl"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div className="my-1 border-t border-app" />}
          <button
            type="button"
            disabled={item.disabled}
            className={`w-full px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-app-secondary hover:bg-app-hover hover:text-app'
            }`}
            onClick={() => {
              if (item.disabled) return
              item.onClick()
              onClose()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
