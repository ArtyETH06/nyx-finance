import { Link, NavLink } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import AddressBox from './AddressBox'
import { useTheme } from '../lib/theme'
import nyxLogo from '../images/logo.png'

type HeaderProps = {
  showNavigation?: boolean
  showWallet?: boolean
}

export default function Header({ showNavigation = true, showWallet = true }: HeaderProps) {
  const { theme, toggle } = useTheme()

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3 bg-nyx-card border-b border-nyx-border">
      <div className="justify-self-start">
        <Link to="/" className="flex flex-col leading-tight group">
          <img
            src={nyxLogo}
            alt="NYX"
            className="h-8 w-auto object-contain mb-0.5 opacity-95 group-hover:opacity-100 transition-opacity duration-120"
            style={{ filter: 'var(--nyx-logo-filter)' }}
          />
          <span className="text-[11px] text-nyx-muted tracking-wide">
            Public blockchain. Private business.
          </span>
        </Link>
      </div>

      <div className="justify-self-center">
        {showNavigation && (
          <nav className="flex items-center gap-3">
            {[
              { to: '/invoices/create', label: 'Create Invoice' },
              { to: '/invoices', label: 'Invoices' },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    'relative px-3 py-1.5 text-sm transition-colors duration-120',
                    'after:absolute after:left-2 after:right-2 after:-bottom-1 after:h-0.5 after:rounded-full after:transition-opacity',
                    isActive
                      ? 'text-nyx-text after:bg-nyx-accent after:opacity-100'
                      : 'text-nyx-muted hover:text-nyx-text after:opacity-0',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div className="justify-self-end flex items-center gap-2">
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-nyx-muted hover:text-nyx-text hover:bg-nyx-hover transition-colors duration-150"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {showWallet && <AddressBox />}
      </div>
    </header>
  )
}
