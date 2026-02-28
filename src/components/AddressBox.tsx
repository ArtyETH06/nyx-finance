import { useState, useRef, useEffect } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useNavigate } from 'react-router-dom'
import { Wallet, LayoutDashboard, User } from 'lucide-react'

function shortenUnlinkAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 10)}...${address.slice(-6)}`
}

export default function AddressBox() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const address = activeAccount?.address ?? ''

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!activeAccount) return null

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={handleCopy}
        onMouseEnter={() => setDropdownOpen(true)}
        className={[
          'flex items-center gap-2 px-3 py-1.5 select-none cursor-pointer',
          'bg-nyx-secondary rounded-full text-sm text-nyx-text font-mono',
          'border transition-all duration-150',
          copied
            ? 'border-nyx-success text-nyx-success'
            : 'border-[rgba(255,255,255,0.08)] hover:shadow-pill-hover hover:border-nyx-accent',
        ].join(' ')}
      >
        {copied ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-nyx-success flex-shrink-0" />
            <span className="text-nyx-success">Copied!</span>
          </>
        ) : (
          <>
            <Wallet size={13} className="text-nyx-muted flex-shrink-0" strokeWidth={1.5} />
            <span>{shortenUnlinkAddress(address)}</span>
          </>
        )}
      </button>

      {dropdownOpen && (
        <div
          className="dropdown-animate absolute right-0 top-full mt-2 w-52 bg-nyx-secondary border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl overflow-hidden z-50"
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <button
            onClick={() => { setDropdownOpen(false); navigate('/wallet') }}
            className="w-full text-left px-4 py-3 text-sm text-nyx-muted hover:text-nyx-text hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150 flex items-center gap-3"
          >
            <LayoutDashboard size={14} strokeWidth={1.5} />
            Wallet
          </button>
          <button
            onClick={() => { setDropdownOpen(false); navigate('/profile') }}
            className="w-full text-left px-4 py-3 text-sm text-nyx-muted hover:text-nyx-text hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150 flex items-center gap-3"
          >
            <User size={14} strokeWidth={1.5} />
            Profile
          </button>
        </div>
      )}
    </div>
  )
}
