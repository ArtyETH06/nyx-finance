import { useState } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { ShieldAlert, KeyRound } from 'lucide-react'

type Step = 'intro' | 'mnemonic' | 'confirm'

export default function WalletPopup() {
  const { createWallet, createAccount, busy } = useUnlink()
  const [step, setStep] = useState<Step>('intro')
  const [mnemonic, setMnemonic] = useState<string>('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateWallet() {
    setError(null)
    try {
      const result = await createWallet()
      setMnemonic(result.mnemonic)
      setStep('mnemonic')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create wallet')
    }
  }

  async function handleConfirm() {
    if (!confirmed) return
    setError(null)
    try {
      await createAccount()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create account')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
      <div className="w-full max-w-md nyx-card p-8 shadow-2xl mx-4">

        {step === 'intro' && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-semibold text-nyx-text mb-1 tracking-tight">Welcome to NYX</h1>
              <p className="text-nyx-muted text-sm">Public blockchain. Private business.</p>
            </div>

            <div className="bg-nyx-bg border border-nyx-border rounded-xl p-4 mb-6 flex gap-3">
              <ShieldAlert size={16} className="text-nyx-danger flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-nyx-muted text-sm leading-relaxed">
                <span className="text-nyx-danger font-medium">NYX is non-custodial.</span>{' '}
                Your wallet is encrypted and stored only on this device. If you lose your recovery phrase, your funds cannot be recovered by anyone — including us.
              </p>
            </div>

            {error && (
              <p className="text-nyx-danger text-sm mb-4">{error}</p>
            )}

            <button onClick={handleCreateWallet} disabled={busy} className="btn-primary">
              {busy ? 'Creating wallet...' : 'Create Private Wallet'}
            </button>
          </>
        )}

        {step === 'mnemonic' && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-nyx-text mb-1 tracking-tight">Your Recovery Phrase</h2>
              <p className="text-nyx-muted text-sm">Write these words down in order. Store them somewhere safe and private.</p>
            </div>

            <div className="bg-nyx-bg border border-nyx-border rounded-xl p-4 mb-2">
              <p className="text-nyx-text font-mono text-sm leading-relaxed break-words select-all">
                {mnemonic}
              </p>
            </div>

            <p className="text-nyx-muted text-xs mb-6">
              Click the phrase above to select all and copy.
            </p>

            <div className="bg-nyx-bg border border-nyx-danger/20 rounded-xl p-4 mb-6 flex gap-3">
              <KeyRound size={15} className="text-nyx-danger flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-nyx-danger text-sm">
                Never share your recovery phrase. Anyone with these words can access your funds.
              </p>
            </div>

            <button onClick={() => setStep('confirm')} className="btn-primary">
              I've Saved My Recovery Phrase
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-nyx-text mb-1 tracking-tight">Confirm Backup</h2>
              <p className="text-nyx-muted text-sm">Before continuing, confirm you've saved your recovery phrase.</p>
            </div>

            <div className="bg-nyx-bg border border-nyx-border rounded-xl p-4 mb-6 flex gap-3">
              <ShieldAlert size={15} className="text-nyx-danger flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="text-nyx-muted text-sm leading-relaxed">
                <span className="text-nyx-danger font-medium">Warning:</span>{' '}
                If you lose access to this device without a backup, your funds will be permanently lost.
              </p>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-nyx-accent cursor-pointer"
              />
              <span className="text-nyx-text text-sm">
                I have saved my recovery phrase in a secure location.
              </span>
            </label>

            {error && (
              <p className="text-nyx-danger text-sm mb-4">{error}</p>
            )}

            <button onClick={handleConfirm} disabled={!confirmed || busy} className="btn-primary">
              {busy ? 'Setting up account...' : 'Continue to NYX'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
