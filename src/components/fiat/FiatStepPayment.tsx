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
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{title}</span>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
    </button>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 text-sm">{value}</div>
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
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 2 of 3</p>
      <h3 className="text-xl font-semibold text-slate-900">Choose payment method</h3>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
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
