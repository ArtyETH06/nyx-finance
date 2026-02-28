import { Link } from 'react-router-dom'
import AddressBox from './AddressBox'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-nyx-bg border-b border-nyx-border">
      <Link to="/" className="flex flex-col leading-tight group">
        <span className="text-xl font-semibold text-nyx-text tracking-wide group-hover:text-white transition-colors">
          NYX
        </span>
        <span className="text-xs text-nyx-muted">
          Public blockchain. Private business.
        </span>
      </Link>

      <AddressBox />
    </header>
  )
}
