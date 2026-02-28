import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import FiatStepBuy from './FiatStepBuy'
import FiatStepWallet from './FiatStepWallet'
import FiatStepPayment from './FiatStepPayment'
import FiatStepSuccess from './FiatStepSuccess'

type FiatCurrency = 'USD' | 'EUR'
type FiatToken = 'MON' | 'USDCm' | 'USDT' | 'UNLKm'
type PaymentMethod = 'card' | 'google-pay' | null
type Step = 'buy' | 'wallet' | 'payment' | 'processing' | 'success'

interface FiatModalProps {
  isOpen: boolean
  invoiceAmount: number
  onClose: () => void
}

function parsePositive(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function fmt(value: number, max = 4): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  })
}

function randomTxId(): string {
  const alphabet = 'abcdef0123456789'
  let out = '0x'
  for (let i = 0; i < 64; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

const USD_TO_TOKEN_RATE: Record<FiatToken, number> = {
  MON: 45,
  USDCm: 1,
  USDT: 1,
  UNLKm: 2,
}

export default function FiatModal({ isOpen, invoiceAmount, onClose }: FiatModalProps) {
  const [step, setStep] = useState<Step>('buy')
  const [amount, setAmount] = useState(invoiceAmount.toFixed(2))
  const [currency, setCurrency] = useState<FiatCurrency>('USD')
  const [token, setToken] = useState<FiatToken>('USDCm')
  const [walletAddress, setWalletAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)
  const [transactionId, setTransactionId] = useState('')

  const receiveAmount = useMemo(() => {
    const pay = parsePositive(amount)
    const usd = currency === 'USD' ? pay : pay * 1.1
    return usd * USD_TO_TOKEN_RATE[token]
  }, [amount, currency, token])

  if (!isOpen) return null

  const closeAndReset = () => {
    setStep('buy')
    setAmount(invoiceAmount.toFixed(2))
    setCurrency('USD')
    setToken('USDCm')
    setWalletAddress('')
    setPaymentMethod(null)
    setTransactionId('')
    onClose()
  }

  const handleFinalProceed = () => {
    setStep('processing')
    window.setTimeout(() => {
      setTransactionId(randomTxId())
      setStep('success')
    }, 2000)
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
          <FiatStepPayment
            paymentMethod={paymentMethod}
            onSelectPaymentMethod={setPaymentMethod}
            onBack={() => setStep('wallet')}
            onProceed={handleFinalProceed}
          />
        )}

        {step === 'processing' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <Loader2 size={22} className="mx-auto animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">Processing payment...</h3>
            <p className="text-sm text-slate-500">Submitting your order on AlchemyPay Testnet.</p>
          </div>
        )}

        {step === 'success' && (
          <FiatStepSuccess
            purchasedAmountText={`${fmt(receiveAmount)} ${token}`}
            token={token}
            walletAddress={walletAddress}
            transactionId={transactionId}
            onClose={closeAndReset}
          />
        )}
      </div>
    </div>
  )
}
