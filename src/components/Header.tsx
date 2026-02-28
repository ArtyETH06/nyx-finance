import { Link, NavLink } from 'react-router-dom'
import AddressBox from './AddressBox'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-nyx-bg border-b border-[rgba(255,255,255,0.06)]">
      <div className="flex items-center gap-10">
        <Link to="/" className="flex flex-col leading-tight group">
          <span className="text-xl font-semibold text-nyx-text tracking-widest group-hover:text-white transition-colors duration-150">
            NYX
          </span>
          <span className="text-[11px] text-nyx-muted tracking-wide">
            Public blockchain. Private business.
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              [
                'px-3 py-1.5 rounded-lg text-sm transition-colors duration-150',
                isActive
                  ? 'text-nyx-text bg-[rgba(255,255,255,0.06)]'
                  : 'text-nyx-muted hover:text-nyx-text hover:bg-[rgba(255,255,255,0.04)]',
              ].join(' ')
            }
          >
            Invoices
          </NavLink>
        </nav>
      </div>

      <AddressBox />
    </header>
  )
}
