type PaymentMethod = 'card' | 'google-pay' | null

interface FiatStepPaymentProps {
  paymentMethod: PaymentMethod
  onSelectPaymentMethod: (method: Exclude<PaymentMethod, null>) => void
  onProceed: () => void
  onBack: () => void
}

function PaymentOption({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string
  subtitle?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-nyx-accent bg-nyx-active text-nyx-accent'
          : 'border-nyx-border bg-nyx-card text-nyx-text hover:bg-nyx-hover'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{title}</span>
        {subtitle && <span className="text-xs text-nyx-muted">{subtitle}</span>}
      </div>
    </button>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-1">{label}</p>
      <div className="rounded-lg border border-nyx-border bg-nyx-secondary px-3 py-2 text-nyx-text text-sm">{value}</div>
    </div>
  )
}

export default function FiatStepPayment({
  paymentMethod,
  onSelectPaymentMethod,
  onProceed,
  onBack,
}: FiatStepPaymentProps) {
  const canProceed = paymentMethod !== null

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide">Step 2 of 3</p>
      <h3 className="text-xl font-semibold text-nyx-text">Choose payment method</h3>

      <div className="rounded-xl border border-nyx-border bg-nyx-card p-4 space-y-4">
        <div className="space-y-2">
          <PaymentOption
            title="Card"
            subtitle="Visa / Mastercard"
            selected={paymentMethod === 'card'}
            onClick={() => onSelectPaymentMethod('card')}
          />
          <PaymentOption
            title="Google Pay"
            subtitle="GPay"
            selected={paymentMethod === 'google-pay'}
            onClick={() => onSelectPaymentMethod('google-pay')}
          />
        </div>

        {paymentMethod === 'card' && (
          <div className="space-y-3 pt-1">
            <ReadOnlyField label="First name" value="Martin" />
            <ReadOnlyField label="Last name" value="Christina" />
            <ReadOnlyField label="Card number" value="1234 1234 1234 1234" />
            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyField label="Expiration" value="12/28" />
              <ReadOnlyField label="CVV" value="123" />
            </div>
            <ReadOnlyField label="Billing address" value="537 Paper Street, Apt 4" />
          </div>
        )}

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
