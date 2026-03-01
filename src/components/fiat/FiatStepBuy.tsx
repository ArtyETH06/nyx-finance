import { ChevronDown } from 'lucide-react'

type FiatCurrency = 'USD' | 'EUR'
type FiatToken = 'MON' | 'USDCm' | 'USDT' | 'UNLKm'

type BuyState = {
  amount: string
  currency: FiatCurrency
  token: FiatToken
}

interface FiatStepBuyProps {
  state: BuyState
  invoiceAmount: number
  onChange: (patch: Partial<BuyState>) => void
  onProceed: () => void
}

const USD_TO_TOKEN_RATE: Record<FiatToken, number> = {
  MON: 50,
  USDCm: 1,
  USDT: 1,
  UNLKm: 2,
}

const CURRENCY_BADGE: Record<FiatCurrency, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
}

const TOKEN_BADGE: Record<FiatToken, string> = {
  MON: '🟢',
  USDCm: '🔵',
  USDT: '🟩',
  UNLKm: '🟣',
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

const inputCls = 'nyx-input'

export default function FiatStepBuy({ state, invoiceAmount, onChange, onProceed }: FiatStepBuyProps) {
  const payAmount = parsePositive(state.amount)
  const usdAmount = state.currency === 'USD' ? payAmount : payAmount * 1.1
  const receiveAmount = usdAmount * USD_TO_TOKEN_RATE[state.token]
  const canProceed = payAmount > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-nyx-border pb-3 text-sm">
        <button className="rounded-full bg-nyx-active text-nyx-accent px-3 py-1 font-semibold">Buy Crypto</button>
        <button className="text-nyx-muted px-2 py-1">Sell Crypto</button>
        <button className="text-nyx-muted px-2 py-1 inline-flex items-center gap-1">
          Buy Stocks
          <span className="rounded bg-nyx-active text-nyx-accent text-[10px] px-1.5 py-0.5 font-semibold">NEW</span>
        </button>
      </div>

      <div className="rounded-xl border border-nyx-border bg-nyx-card p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-1">You Pay</p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={state.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
              className={`flex-1 ${inputCls}`}
              placeholder={invoiceAmount.toFixed(2)}
            />
            <div className="relative">
              <select
                value={state.currency}
                onChange={(e) => onChange({ currency: e.target.value as FiatCurrency })}
                className={`${inputCls} appearance-none pr-14 py-2`}
              >
                <option value="USD">{CURRENCY_BADGE.USD} USD</option>
                <option value="EUR">{CURRENCY_BADGE.EUR} EUR</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-nyx-muted"
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-1">You Receive (estimate)</p>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg border border-nyx-border bg-nyx-secondary px-3 py-2 text-nyx-text">
              {fmt(receiveAmount)} {state.token}
            </div>
            <div className="relative">
              <select
                value={state.token}
                onChange={(e) => onChange({ token: e.target.value as FiatToken })}
                className={`${inputCls} appearance-none pr-14 py-2`}
              >
                <option value="MON">{TOKEN_BADGE.MON} MON</option>
                <option value="USDCm">{TOKEN_BADGE.USDCm} USDCm</option>
                <option value="USDT">{TOKEN_BADGE.USDT} USDT</option>
                <option value="UNLKm">{TOKEN_BADGE.UNLKm} UNLKm</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-nyx-muted"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-nyx-secondary border border-nyx-border px-3 py-2 text-sm text-nyx-muted">
          Your order: {TOKEN_BADGE[state.token]} {fmt(receiveAmount)} {state.token} for {CURRENCY_BADGE[state.currency]} {fmt(payAmount, 2)} {state.currency}
        </div>

        <button
          type="button"
          disabled={!canProceed}
          onClick={onProceed}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Proceed - Buy {state.token}
        </button>
      </div>

      <p className="text-center text-xs text-nyx-muted">Powered by AlchemyPay Testnet</p>
    </div>
  )
}
