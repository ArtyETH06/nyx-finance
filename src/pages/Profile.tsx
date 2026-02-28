import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { ArrowLeft, Copy, Trash2, Eye, EyeOff, KeyRound, Upload, ShieldAlert, Wallet, Check } from 'lucide-react'
import { useProfile } from '../lib/profile'

const inputCls =
  'w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150'

export default function Profile() {
  const { activeAccount, exportMnemonic, clearWallet, importWallet, busy } = useUnlink()
  const navigate = useNavigate()
  const address = activeAccount?.address ?? ''

  // Profile info
  const { profile, save: saveProfile } = useProfile(address)
  const [profileForm, setProfileForm] = useState(profile)
  const [profileSaved, setProfileSaved] = useState(false)

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    saveProfile(profileForm)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  // Address copy
  const [copied, setCopied] = useState(false)

  // Mnemonic display
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [mnemonicCopied, setMnemonicCopied] = useState(false)

  // Import wallet
  const [importPhrase, setImportPhrase] = useState('')
  const [importStep, setImportStep] = useState<'input' | 'confirm'>('input')
  const [importError, setImportError] = useState<string | null>(null)

  // Clear wallet
  const [clearStep, setClearStep] = useState<'idle' | 'confirm'>('idle')

  const mnemonicWords = mnemonic ? mnemonic.split(' ') : []

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

  async function handleCopyMnemonic() {
    if (!mnemonic) return
    await navigator.clipboard.writeText(mnemonic)
    setMnemonicCopied(true)
    setTimeout(() => setMnemonicCopied(false), 1500)
  }

  async function handleImportWallet() {
    setImportError(null)
    try {
      await importWallet(importPhrase.trim())
      setImportPhrase('')
      setImportStep('input')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to import wallet')
    }
  }

  async function handleClearWallet() {
    await clearWallet()
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

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">
          {profile.firstName ? `Hello, ${profile.firstName} 👋` : 'Profile'}
        </h1>
        <button
          onClick={() => navigate('/wallet')}
          className="btn-secondary"
        >
          <Wallet size={13} strokeWidth={1.5} />
          See Wallet
        </button>
      </div>

      <div className="space-y-4">

        {/* Personal Info */}
        <div className="nyx-card p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-4">Personal Info</p>
          <form onSubmit={handleProfileSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-nyx-muted text-xs mb-1.5">First Name</label>
                <input
                  className={inputCls}
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Alice"
                />
              </div>
              <div>
                <label className="block text-nyx-muted text-xs mb-1.5">Last Name</label>
                <input
                  className={inputCls}
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith"
                />
              </div>
            </div>
            <div>
              <label className="block text-nyx-muted text-xs mb-1.5">Company</label>
              <input
                className={inputCls}
                value={profileForm.company}
                onChange={(e) => setProfileForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Acme Corp"
              />
            </div>
            <div className="pt-1">
              <button type="submit" className="btn-secondary">
                {profileSaved
                  ? <><Check size={13} strokeWidth={2} className="text-nyx-success" /> Saved</>
                  : 'Save Info'
                }
              </button>
            </div>
          </form>
        </div>

        {/* Address */}
        <div className="nyx-card p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-3">Private Address</p>
          <div
            className="relative group cursor-pointer inline-block w-full"
            onClick={handleCopy}
          >
            <p className={`font-mono text-sm break-all transition-colors duration-150 select-none ${
              copied ? 'text-nyx-success' : 'text-nyx-text group-hover:text-nyx-accent'
            }`}>
              {copied ? 'Copied!' : address}
            </p>
            {!copied && (
              <span className="absolute -top-7 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-[rgba(255,255,255,0.08)] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
                Click to copy
              </span>
            )}
          </div>
        </div>

        {/* Recovery Phrase */}
        <div className="nyx-card p-6">
          {showMnemonic && mnemonic ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={13} className="text-nyx-accent" strokeWidth={1.5} />
                <p className="text-xs font-semibold tracking-widest text-nyx-muted uppercase">Recovery Phrase</p>
              </div>
              <p className="text-nyx-muted text-xs leading-relaxed mb-5">
                Your recovery phrase is the only way to restore your wallet. Never share it with anyone.
              </p>

              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => { setShowMnemonic(false); setMnemonic(null) }}
                  className="btn-secondary"
                >
                  <EyeOff size={13} strokeWidth={1.5} />
                  Hide
                </button>
                <button onClick={handleCopyMnemonic} className="btn-secondary">
                  <Copy size={13} strokeWidth={1.5} />
                  {mnemonicCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Word grid */}
              <div className="bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {mnemonicWords.map((word, i) => (
                    <div
                      key={i}
                      className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 flex items-center gap-2"
                    >
                      <span className="text-nyx-muted font-mono text-[10px] w-4 flex-shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="font-mono text-nyx-text text-xs tracking-wide">{word}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-nyx-muted text-xs uppercase tracking-widest mb-1">Recovery Phrase</p>
              <p className="text-nyx-muted text-sm mb-4">
                Export your recovery phrase. Keep it private and secure.
              </p>
              <button onClick={handleExportMnemonic} disabled={busy} className="btn-secondary">
                <Eye size={13} strokeWidth={1.5} />
                Export Mnemonic
              </button>
            </>
          )}
        </div>

        {/* Import Wallet */}
        <div className="nyx-card p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-1">Import Wallet</p>

          {importStep === 'input' ? (
            <>
              <p className="text-nyx-muted text-sm mb-4">
                Restore a wallet from an existing recovery phrase.
              </p>
              <textarea
                value={importPhrase}
                onChange={(e) => setImportPhrase(e.target.value)}
                placeholder="Enter your recovery phrase..."
                rows={3}
                className="w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3 text-nyx-text text-sm font-mono placeholder:text-nyx-muted/40 resize-none focus:outline-none focus:border-nyx-accent transition-colors duration-150 mb-4"
              />
              <button
                onClick={() => setImportStep('confirm')}
                disabled={!importPhrase.trim()}
                className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={13} strokeWidth={1.5} />
                Import Wallet
              </button>
            </>
          ) : (
            <>
              <div className="bg-nyx-bg border border-nyx-danger/20 rounded-xl p-4 mb-5 flex gap-3">
                <ShieldAlert size={15} className="text-nyx-danger flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-nyx-danger font-medium text-sm mb-1">Replace current wallet?</p>
                  <p className="text-nyx-muted text-sm leading-relaxed">
                    This will permanently replace your current wallet and delete your existing private keys from this device. Make sure your current recovery phrase is backed up before continuing.
                  </p>
                </div>
              </div>

              {importError && (
                <p className="text-nyx-danger text-sm mb-4">{importError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setImportStep('input'); setImportError(null) }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportWallet}
                  disabled={busy}
                  className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload size={13} strokeWidth={1.5} />
                  {busy ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Clear Wallet */}
        <div className="nyx-card p-6" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="text-nyx-muted text-xs uppercase tracking-widest mb-1">Danger Zone</p>

          {clearStep === 'idle' ? (
            <>
              <p className="text-nyx-muted text-sm mb-4">
                Permanently remove your wallet from this device. This cannot be undone without your recovery phrase.
              </p>
              <button onClick={() => setClearStep('confirm')} className="btn-danger">
                <Trash2 size={13} strokeWidth={1.5} />
                Clear Wallet
              </button>
            </>
          ) : (
            <>
              <div className="bg-[rgba(239,68,68,0.06)] border border-nyx-danger/30 rounded-xl p-5 mb-5">
                <div className="flex gap-3 mb-4">
                  <ShieldAlert size={20} className="text-nyx-danger flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div>
                    <p className="text-nyx-danger font-semibold text-base mb-1">You are about to erase your wallet.</p>
                    <p className="text-nyx-muted text-sm leading-relaxed">
                      This action is <strong className="text-nyx-text">permanent and irreversible</strong>. Your private keys will be deleted from this device immediately.
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 pl-2">
                  <li className="flex items-start gap-2 text-sm text-nyx-muted">
                    <span className="text-nyx-danger mt-0.5">✕</span>
                    All private balances will become inaccessible from this device.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-nyx-muted">
                    <span className="text-nyx-danger mt-0.5">✕</span>
                    You will need your recovery phrase to restore access.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-nyx-muted">
                    <span className="text-nyx-danger mt-0.5">✕</span>
                    Without your recovery phrase, funds are lost forever.
                  </li>
                </ul>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setClearStep('idle')}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearWallet}
                  disabled={busy}
                  className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                  {busy ? 'Clearing...' : 'Yes, Delete My Wallet'}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </main>
  )
}
