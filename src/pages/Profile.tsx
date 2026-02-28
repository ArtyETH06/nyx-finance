import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'

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
        className="text-nyx-muted text-sm hover:text-nyx-text transition-colors mb-8 flex items-center gap-1"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-semibold text-nyx-text mb-8">Profile</h1>

      <div className="space-y-4">
        {/* Address */}
        <div className="bg-nyx-card border border-nyx-border rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-3">Private Address</p>
          <p className="font-mono text-nyx-text text-sm break-all mb-4">{address}</p>
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm bg-nyx-bg border border-nyx-border rounded-lg text-nyx-text hover:border-nyx-accent transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Address'}
          </button>
        </div>

        {/* Export Mnemonic */}
        <div className="bg-nyx-card border border-nyx-border rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-1">Recovery Phrase</p>
          <p className="text-nyx-muted text-sm mb-4">
            Export your 12-word recovery phrase. Keep it private and secure.
          </p>

          {showMnemonic && mnemonic ? (
            <div className="mb-4">
              <div className="bg-nyx-bg border border-nyx-border rounded-lg p-4 mb-2">
                <p className="font-mono text-nyx-text text-sm leading-relaxed break-words select-all">
                  {mnemonic}
                </p>
              </div>
              <p className="text-nyx-muted text-xs">Click phrase to select all. Never share this.</p>
              <button
                onClick={() => { setShowMnemonic(false); setMnemonic(null) }}
                className="mt-3 text-xs text-nyx-muted hover:text-nyx-text transition-colors"
              >
                Hide
              </button>
            </div>
          ) : (
            <button
              onClick={handleExportMnemonic}
              className="px-4 py-2 text-sm bg-nyx-bg border border-nyx-border rounded-lg text-nyx-text hover:border-nyx-accent transition-colors"
            >
              Export Mnemonic
            </button>
          )}
        </div>

        {/* Clear Wallet */}
        <div className="bg-nyx-card border border-nyx-danger/30 rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-1">Danger Zone</p>
          <p className="text-nyx-muted text-sm mb-4">
            Permanently remove your wallet from this device. This cannot be undone without your recovery phrase.
          </p>
          <button
            onClick={handleClearWallet}
            className="px-4 py-2 text-sm bg-nyx-bg border border-nyx-danger/50 rounded-lg text-nyx-danger hover:bg-nyx-danger/10 transition-colors"
          >
            Clear Wallet
          </button>
        </div>
      </div>
    </main>
  )
}
