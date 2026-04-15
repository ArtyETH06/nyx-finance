import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UnlinkProvider } from './lib/unlink'
import { ThemeProvider } from './lib/theme'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UnlinkProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </UnlinkProvider>
  </StrictMode>,
)
