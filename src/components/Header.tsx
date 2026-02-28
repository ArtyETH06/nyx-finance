import { Link, NavLink } from 'react-router-dom'
import AddressBox from './AddressBox'
import nyxLogo from '../images/logo.png'

export default function Header() {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-4 bg-nyx-bg border-b border-[rgba(255,255,255,0.06)]">
      <div className="justify-self-start">
        <Link to="/" className="flex flex-col leading-tight group">
          <img
            src={nyxLogo}
            alt="NYX"
            className="h-9 w-auto -ml-12 object-contain mb-0.5 opacity-95 group-hover:opacity-100 transition-opacity duration-150"
          />
          <span className="text-[11px] text-nyx-muted tracking-wide">
            Public blockchain. Private business.
          </span>
        </Link>
      </div>

      <nav className="justify-self-center flex items-center gap-3">
        {[
          { to: '/invoices',      label: 'Invoices'      },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'relative px-3 py-1.5 text-sm transition-colors duration-150',
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

      <div className="justify-self-end">
        <AddressBox />
      </div>
    </header>
  )
}
