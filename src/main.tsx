import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UnlinkProvider } from '@unlink-xyz/react'
import { ThemeProvider } from './lib/theme'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UnlinkProvider chain="monad-testnet">
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </UnlinkProvider>
  </StrictMode>,
)
