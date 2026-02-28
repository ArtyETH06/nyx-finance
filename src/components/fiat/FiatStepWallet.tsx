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
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 1 of 3</p>
      <h3 className="text-xl font-semibold text-slate-900">Enter MON Wallet Address</h3>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Network</p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
            Monad Testnet
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Wallet Address</p>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => onWalletAddressChange(e.target.value)}
            placeholder="Paste destination wallet address"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-700 py-2.5 font-medium hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canProceed}
            onClick={onProceed}
            className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
