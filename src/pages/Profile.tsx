import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { ArrowLeft, Copy, Trash2, Eye, EyeOff } from 'lucide-react'

export default function Profile() {
  const { activeAccount, exportMnemonic, clearWallet } = useUnlink()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [showMnemonic, setShowMnemonic] = useState(false)

  const address = activeAccount?.address ?? ''

  async function handleCopy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleExportMnemonic() {
    const phrase = await exportMnemonic()
    setMnemonic(phrase)
    setShowMnemonic(true)
  }

  async function handleClearWallet() {
    const confirmed = confirm(
      'Are you sure you want to clear your wallet?\n\nThis will permanently delete your private keys from this device. Make sure you have backed up your recovery phrase.'
    )
    if (confirmed) {
      await clearWallet()
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <button
        onClick={() => navigate('/')}
        className="btn-ghost text-nyx-muted text-sm hover:text-nyx-text mb-8 flex items-center gap-1.5"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back
      </button>

      <h1 className="text-2xl font-semibold text-nyx-text mb-8 tracking-tight">Profile</h1>

      <div className="space-y-4">
        {/* Address */}
        <div className="nyx-card p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-3">Private Address</p>
          <p className="font-mono text-nyx-text text-sm break-all mb-4">{address}</p>
          <button onClick={handleCopy} className="btn-secondary">
            <Copy size={13} strokeWidth={1.5} />
            {copied ? 'Copied!' : 'Copy Address'}
          </button>
        </div>

        {/* Export Mnemonic */}
        <div className="nyx-card p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-1">Recovery Phrase</p>
          <p className="text-nyx-muted text-sm mb-4">
            Export your 12-word recovery phrase. Keep it private and secure.
          </p>

          {showMnemonic && mnemonic ? (
            <div className="mb-4">
              <div className="bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-xl p-4 mb-2">
                <p className="font-mono text-nyx-text text-sm leading-relaxed break-words select-all">
                  {mnemonic}
                </p>
              </div>
              <p className="text-nyx-muted text-xs mb-3">Click phrase to select all. Never share this.</p>
              <button
                onClick={() => { setShowMnemonic(false); setMnemonic(null) }}
                className="btn-ghost text-nyx-muted text-xs hover:text-nyx-text flex items-center gap-1.5"
              >
                <EyeOff size={12} strokeWidth={1.5} />
                Hide
              </button>
            </div>
          ) : (
            <button onClick={handleExportMnemonic} className="btn-secondary">
              <Eye size={13} strokeWidth={1.5} />
              Export Mnemonic
            </button>
          )}
        </div>

        {/* Clear Wallet */}
        <div className="nyx-card p-6" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-1">Danger Zone</p>
          <p className="text-nyx-muted text-sm mb-4">
            Permanently remove your wallet from this device. This cannot be undone without your recovery phrase.
          </p>
          <button onClick={handleClearWallet} className="btn-danger">
            <Trash2 size={13} strokeWidth={1.5} />
            Clear Wallet
          </button>
        </div>
      </div>
    </main>
  )
}
