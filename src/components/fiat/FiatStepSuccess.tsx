interface FiatStepSuccessProps {
  purchasedAmountText: string
  token: string
  walletAddress: string
  transactionId: string
  onClose: () => void
}

export default function FiatStepSuccess({
  purchasedAmountText,
  token,
  walletAddress,
  transactionId,
  onClose,
}: FiatStepSuccessProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-xl font-semibold text-emerald-700">Payment Successful</h3>
        <p className="text-sm text-emerald-700 mt-1">
          Your tokens have been successfully transferred to your wallet on Monad Testnet.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Purchased</p>
          <p className="text-slate-800">{purchasedAmountText}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Token</p>
          <p className="text-slate-800">{token}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Destination Wallet</p>
          <p className="text-slate-800 break-all">{walletAddress}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mock Transaction ID</p>
          <p className="text-slate-800 break-all">{transactionId}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 transition-colors"
      >
        Return to Invoice
      </button>
    </div>
  )
}
