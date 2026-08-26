import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './theme'
import { initLocale } from './i18n'
import { I18nProvider } from './i18n/I18nProvider'
import './index.css'
import App from './App'

initTheme()
initLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
