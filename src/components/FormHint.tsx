interface FormHintProps {
  children: string
  /** Smaller inline hint under a field (e.g. port auto-assign). */
  compact?: boolean
  className?: string
}

function renderWithTokens(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  if (parts.length === 1) return text

  return parts.map((part, index) => {
    const match = /^\{\{([^}]+)\}\}$/.exec(part)
    if (match) {
      return (
        <code key={index} className="form-hint-token">
          {`{{${match[1]}}}`}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}

export function FormHint({ children, compact, className = '' }: FormHintProps) {
  return (
    <p className={`form-hint${compact ? ' form-hint-compact' : ''} ${className}`.trim()}>
      {renderWithTokens(children)}
    </p>
  )
}
