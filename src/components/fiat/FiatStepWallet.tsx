const inputCls = 'nyx-input'

interface FiatStepWalletProps {
  walletAddress: string
  onWalletAddressChange: (value: string) => void
  onProceed: () => void
  onBack: () => void
}

export default function FiatStepWallet({
  walletAddress,
  onWalletAddressChange,
  onProceed,
  onBack,
}: FiatStepWalletProps) {
  const canProceed = walletAddress.trim().length > 0

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Step 1 of 3</p>
      <h3 className="text-xl font-semibold text-nyx-text">Enter MON Wallet Address</h3>

      <div className="rounded-xl border border-nyx-border bg-nyx-card p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-1">Network</p>
          <div className="rounded-lg border border-nyx-border bg-nyx-secondary px-3 py-2 text-nyx-text">
            Monad Testnet
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-1">Wallet Address</p>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => onWalletAddressChange(e.target.value)}
            placeholder="Paste destination wallet address"
            className={inputCls}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-nyx-border bg-nyx-card text-nyx-text py-2.5 font-medium hover:bg-nyx-hover transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canProceed}
            onClick={onProceed}
            className="flex-1 rounded-lg bg-nyx-accent text-white py-2.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-nyx-accent-h transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
