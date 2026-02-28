import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import FiatStepBuy from './FiatStepBuy'
import FiatStepWallet from './FiatStepWallet'
import FiatStepPayment from './FiatStepPayment'
import { sendMockAlchemyPayment } from '../../lib/mockAlchemyTransfer'

type FiatCurrency = 'USD' | 'EUR'
type FiatToken = 'MON' | 'USDCm' | 'USDT' | 'UNLKm'
type PaymentMethod = 'card' | 'google-pay' | null
type Step = 'buy' | 'wallet' | 'payment' | 'processing'

interface FiatModalProps {
  isOpen: boolean
  invoiceAmount: number
  invoiceTokenSymbol: string
  depositAddress?: string | null
  onSimulatedFunding?: (payload: {
    destinationAddress: string
    fundedToken: FiatToken
    fundedAmount: string
    fundingTxHash: string
  }) => Promise<void>
  onClose: () => void
}

function parsePositive(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

export default function FiatModal({
  isOpen,
  invoiceAmount,
  invoiceTokenSymbol,
  depositAddress,
  onSimulatedFunding,
  onClose,
}: FiatModalProps) {
  const [step, setStep] = useState<Step>('buy')
  const [amount, setAmount] = useState(invoiceAmount.toFixed(2))
  const [currency, setCurrency] = useState<FiatCurrency>('USD')
  const [token, setToken] = useState<FiatToken>('USDCm')
  const [walletAddress, setWalletAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (depositAddress) setWalletAddress(depositAddress)
  }, [isOpen, depositAddress])

  if (!isOpen) return null

  const closeAndReset = () => {
    setStep('buy')
    setAmount(invoiceAmount.toFixed(2))
    setCurrency('USD')
    setToken('USDCm')
    setWalletAddress(depositAddress ?? '')
    setPaymentMethod(null)
    setProcessingError(null)
    onClose()
  }

  const handleFinalProceed = async () => {
    setStep('processing')
    setProcessingError(null)
    try {
      const pay = parsePositive(amount)
      if (!walletAddress.trim()) throw new Error('Missing destination wallet address')
      if (pay <= 0) throw new Error('Invalid payment amount')
      const result = await sendMockAlchemyPayment({
        destinationAddress: walletAddress.trim(),
        payAmount: pay,
        currency,
        token,
      })
      if (token !== invoiceTokenSymbol) {
        throw new Error(`Auto-settlement requires ${invoiceTokenSymbol}. Please buy ${invoiceTokenSymbol} in this mock flow.`)
      }
      closeAndReset()
      if (onSimulatedFunding) {
        await onSimulatedFunding({
          destinationAddress: walletAddress.trim(),
          fundedToken: token,
          fundedAmount: result.tokenAmount,
          fundingTxHash: result.txHash,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to simulate payment transfer'
      setProcessingError(message)
      setStep('payment')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={closeAndReset} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AlchemyPay Testnet</h2>
            <p className="text-xs text-slate-500">Simulated fiat payment flow</p>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {(step === 'wallet' || step === 'payment') && (
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            <div className={`h-1 rounded-full ${step === 'wallet' || step === 'payment' ? 'bg-blue-500' : 'bg-slate-200'}`} />
            <div className={`h-1 rounded-full ${step === 'payment' ? 'bg-blue-500' : 'bg-slate-200'}`} />
            <div className="h-1 rounded-full bg-slate-200" />
          </div>
        )}

        {step === 'buy' && (
          <FiatStepBuy
            state={{ amount, currency, token }}
            invoiceAmount={invoiceAmount}
            onChange={(patch) => {
              if (patch.amount != null) setAmount(patch.amount)
              if (patch.currency != null) setCurrency(patch.currency)
              if (patch.token != null) setToken(patch.token)
            }}
            onProceed={() => setStep('wallet')}
          />
        )}

        {step === 'wallet' && (
          <FiatStepWallet
            walletAddress={walletAddress}
            onWalletAddressChange={setWalletAddress}
            onBack={() => setStep('buy')}
            onProceed={() => setStep('payment')}
          />
        )}

        {step === 'payment' && (
          <div className="space-y-3">
            <FiatStepPayment
              paymentMethod={paymentMethod}
              onSelectPaymentMethod={setPaymentMethod}
              onBack={() => setStep('wallet')}
              onProceed={() => { void handleFinalProceed() }}
            />
            {processingError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {processingError}
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <Loader2 size={22} className="mx-auto animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">Processing payment...</h3>
            <p className="text-sm text-slate-500">Submitting your order on AlchemyPay Testnet.</p>
          </div>
        )}

      </div>
    </div>
  )
}
