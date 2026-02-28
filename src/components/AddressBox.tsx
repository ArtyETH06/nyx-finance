import { useState, useRef, useEffect } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useNavigate } from 'react-router-dom'

function shortenUnlinkAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 10)}...${address.slice(-6)}`
}

export default function AddressBox() {
  const { activeAccount, exportMnemonic, clearWallet } = useUnlink()
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

  async function handleExportMnemonic() {
    setDropdownOpen(false)
    const mnemonic = await exportMnemonic()
    alert(`Your recovery phrase:\n\n${mnemonic}\n\nStore this securely. Never share it.`)
  }

  async function handleClearWallet() {
    setDropdownOpen(false)
    const confirmed = confirm(
      'Are you sure you want to clear your wallet?\n\nThis will permanently delete your private keys from this device. Make sure you have backed up your recovery phrase.'
    )
    if (confirmed) {
      await clearWallet()
    }
  }

  if (!activeAccount) return null

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={handleCopy}
        onMouseEnter={() => setDropdownOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-nyx-card border border-nyx-border rounded-lg text-sm text-nyx-text cursor-pointer transition-colors hover:border-nyx-accent select-none"
      >
        <span className="w-2 h-2 rounded-full bg-nyx-success flex-shrink-0" />
        <span className="font-mono">
          {copied ? 'Copied!' : shortenUnlinkAddress(address)}
        </span>
      </button>

      {dropdownOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-48 bg-nyx-card border border-nyx-border rounded-lg shadow-xl overflow-hidden z-50"
          onMouseLeave={() => setDropdownOpen(false)}
        >
          <button
            onClick={() => { setDropdownOpen(false); navigate('/profile') }}
            className="w-full text-left px-4 py-2.5 text-sm text-nyx-text hover:bg-nyx-border transition-colors"
          >
            Profile
          </button>
          <button
            onClick={handleExportMnemonic}
            className="w-full text-left px-4 py-2.5 text-sm text-nyx-text hover:bg-nyx-border transition-colors"
          >
            Export Mnemonic
          </button>
          <div className="border-t border-nyx-border" />
          <button
            onClick={handleClearWallet}
            className="w-full text-left px-4 py-2.5 text-sm text-nyx-danger hover:bg-nyx-border transition-colors"
          >
            Clear Wallet
          </button>
        </div>
      )}
    </div>
  )
}
