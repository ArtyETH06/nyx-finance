import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'darknode'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('nyx-theme') as Theme) || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('theme-light', 'theme-darknode')
    html.classList.add(`theme-${theme}`)
    try { localStorage.setItem('nyx-theme', theme) } catch {}
  }, [theme])
  const toggle = () => setTheme(t => t === 'light' ? 'darknode' : 'light')
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
