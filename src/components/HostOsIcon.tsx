import type { HostOsId } from '../types'

const OS_STYLES: Record<
  HostOsId,
  { bg: string; fg?: string; label: string }
> = {
  ubuntu: { bg: '#E95420', label: 'Ubuntu' },
  debian: { bg: '#A80030', label: 'Debian' },
  centos: { bg: '#932279', label: 'CentOS' },
  rhel: { bg: '#EE0000', label: 'RHEL' },
  fedora: { bg: '#294172', label: 'Fedora' },
  arch: { bg: '#1793D1', label: 'Arch' },
  alpine: { bg: '#0D597F', label: 'Alpine' },
  opensuse: { bg: '#73BA25', label: 'openSUSE' },
  macos: { bg: '#555555', label: 'macOS' },
  freebsd: { bg: '#AB2B28', label: 'FreeBSD' },
  windows: { bg: '#0078D4', label: 'Windows' },
}

function OsGlyph({ osId }: { osId: HostOsId }) {
  switch (osId) {
    case 'ubuntu':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <circle cx="8.5" cy="12" r="2.2" fill="currentColor" />
          <circle cx="15.5" cy="8.5" r="2.2" fill="currentColor" />
          <circle cx="15.5" cy="15.5" r="2.2" fill="currentColor" />
          <path
            d="M8.5 12h4.2M13.2 9.8l1.8 1.8M13.2 14.2l1.8-1.8"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      )
    case 'debian':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path
            fill="currentColor"
            d="M12 3c3.2 0 6.5 2.2 6.5 6.1 0 4.8-4.2 11.9-6.5 11.9S5.5 13.9 5.5 9.1C5.5 5.2 8.8 3 12 3zm0 2.2c-2.1 0-3.8 1.4-3.8 3.9 0 3.1 2.7 8.3 3.8 8.3s3.8-5.2 3.8-8.3c0-2.5-1.7-3.9-3.8-3.9z"
          />
        </svg>
      )
    case 'fedora':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path
            fill="currentColor"
            d="M12 4c2.8 0 5 2.2 5 5.2 0 2.2-1.2 4.1-3 5.1V18H10v-3.7c-1.8-1-3-2.9-3-5.1C7 6.2 9.2 4 12 4z"
          />
        </svg>
      )
    case 'arch':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path fill="currentColor" d="M12 3 4 20h16L12 3zm0 4.5 5.2 11H6.8L12 7.5z" />
        </svg>
      )
    case 'macos':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path
            fill="currentColor"
            d="M16.8 12.9c0 2.5 2.2 3.3 2.2 3.3s-.3 2.1-1.9 4.1c-1.1 1.4-2.3 2.8-4.1 2.8-1.7 0-2.2-1.1-4.1-1.1-1.9 0-2.5 1.1-4.1 1.1-1.8 0-3.1-1.6-4.2-3-2.3-3.2-4-9.1-1.7-13.1 1.1-1.9 3.1-3.1 5.3-3.1 1.7 0 3.2 1.1 4.1 1.1.9 0 2.6-1.3 4.4-1.1.7 0 2.8.3 4.1 2.2-3.5 1.9-2.9 6.8.1 8.1zM14.5 4.8c.9-1.1 1.6-2.6 1.4-4.1-1.4.1-3.1.9-4.1 2-1 1.1-1.8 2.6-1.6 4.1 1.6.1 3.3-.8 4.3-2z"
          />
        </svg>
      )
    case 'windows':
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path fill="currentColor" d="M3 5.5 10.5 4.2V12H3V5.5zm0 13 7.5 1.2V12H3v6.5zM11.2 4 21 2.4v9.3h-9.8V4zm0 16.6L21 22V12.7h-9.8V20.6z" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" aria-hidden>
          <path
            fill="currentColor"
            d="M4 5a2 2 0 012-2h12a2 2 0 012 2v4H4V5zm0 6h16v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8zm4 2v4h2v-4H8zm4 0v4h2v-4h-2z"
          />
        </svg>
      )
  }
}

const SIZE_CLASS = {
  sm: 'w-8 h-8 rounded-lg text-sm',
  md: 'w-11 h-11 rounded-xl text-lg',
  lg: 'w-12 h-12 rounded-xl text-xl',
} as const

interface HostOsIconProps {
  name: string
  osId?: HostOsId | null
  accentColor?: string
  size?: keyof typeof SIZE_CLASS
  className?: string
}

export function HostOsIcon({
  name,
  osId,
  accentColor = '#f97316',
  size = 'md',
  className = '',
}: HostOsIconProps) {
  const sizeClass = SIZE_CLASS[size]

  if (osId && OS_STYLES[osId]) {
    const style = OS_STYLES[osId]
    return (
      <div
        className={`flex items-center justify-center shrink-0 text-white ${sizeClass} ${className}`}
        style={{ background: style.bg }}
        title={style.label}
        aria-label={style.label}
      >
        <OsGlyph osId={osId} />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center shrink-0 font-bold ${sizeClass} ${className}`}
      style={{
        background: `${accentColor}25`,
        color: accentColor,
      }}
      title={name}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function hostOsLabel(osId?: HostOsId | null): string | undefined {
  if (!osId) return undefined
  return OS_STYLES[osId]?.label
}
