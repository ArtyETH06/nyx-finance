interface FiatStepSuccessProps {
  purchasedAmountText: string
  token: string
  walletAddress: string
  sourceWalletAddress?: string | null
  transactionId: string
  onClose: () => void
}

export default function FiatStepSuccess({
  purchasedAmountText,
  token,
  walletAddress,
  sourceWalletAddress,
  transactionId,
  onClose,
}: FiatStepSuccessProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-nyx-border bg-nyx-card p-4">
        <h3 className="text-xl font-semibold text-nyx-success">Payment Successful</h3>
        <p className="text-sm text-nyx-muted mt-1">
          Your tokens have been successfully transferred to your wallet on Monad Testnet.
        </p>
      </div>

      <div className="rounded-xl border border-nyx-border bg-nyx-card p-4 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Amount Purchased</p>
          <p className="text-nyx-text">{purchasedAmountText}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Token</p>
          <p className="text-nyx-text">{token}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Destination Wallet</p>
          <p className="text-nyx-text break-all">{walletAddress}</p>
        </div>
        {sourceWalletAddress && (
          <div>
            <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Source Wallet</p>
            <p className="text-nyx-text break-all">{sourceWalletAddress}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Mock Transaction ID</p>
          <p className="text-nyx-text break-all">{transactionId}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="btn-primary"
      >
        Return to Invoice
      </button>
    </div>
  )
}
