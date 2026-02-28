import { Link } from 'react-router-dom'
import AddressBox from './AddressBox'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-nyx-bg border-b border-[rgba(255,255,255,0.06)]">
      <Link to="/" className="flex flex-col leading-tight group">
        <span className="text-xl font-semibold text-nyx-text tracking-widest group-hover:text-white transition-colors duration-150">
          NYX
        </span>
        <span className="text-[11px] text-nyx-muted tracking-wide">
          Public blockchain. Private business.
        </span>
      </Link>

      <AddressBox />
    </header>
  )
}
