import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink, useUnlinkBalances, useDeposit, useWithdraw, parseAmount } from '@unlink-xyz/react'
import {
  Copy, Wifi, ShieldCheck, Wallet as WalletIcon,
  ArrowDownToLine, ArrowUpFromLine, Link as LinkIcon,
} from 'lucide-react'
import { toast } from '../lib/toast'
import { USDC, getTokenByAddress, displayAmount, shortenAddress } from '../lib/tokens'

// ── helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150'

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={14} className="text-nyx-accent" strokeWidth={1.5} />
      <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase">{title}</p>
    </div>
  )
}

// ── component ────────────────────────────────────────────────────────────────

export default function Wallet() {
  const navigate = useNavigate()
  const { ready, walletExists, activeAccount, refresh } = useUnlink()
  const { balances, loading: balancesLoading } = useUnlinkBalances()
  const { execute: depositExec, isPending: depositPending } = useDeposit()
  const { execute: withdrawExec, isPending: withdrawPending } = useWithdraw()

  const [copied, setCopied] = useState(false)
  const [publicAddress, setPublicAddress] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const address = activeAccount?.address ?? ''

  // Guard — redirect if wallet not ready
  useEffect(() => {
    if (ready && (!walletExists || !activeAccount)) {
      navigate('/')
    }
  }, [ready, walletExists, activeAccount, navigate])

  async function handleCopyAddress() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function connectPublicWallet() {
    if (!window.ethereum) {
      toast.show('No wallet detected. Please install MetaMask or a compatible browser wallet.', 'error')
      return
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setPublicAddress(accounts[0])
      toast.show('Public wallet connected.')
    } catch {
      toast.show('Wallet connection rejected.', 'error')
    }
  }

  async function handleDeposit() {
    if (!publicAddress || !depositAmount) return
    if (!USDC.address) {
      toast.show('USDC address not configured. Set VITE_USDC_ADDRESS in .env.', 'error')
      return
    }
    try {
      const amount = parseAmount(depositAmount, USDC.decimals)
      const result = await depositExec([{ token: USDC.address, amount, depositor: publicAddress }])
      // Submit the on-chain EVM transaction via the connected public wallet
      if (result && window.ethereum) {
        const r = result as { to?: string; calldata?: string }
        if (r.to && r.calldata) {
          await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{ to: r.to, data: r.calldata, from: publicAddress }],
          })
        }
      }
      await refresh()
      setDepositAmount('')
      toast.show('Deposit submitted. Balances will update shortly.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Deposit failed.', 'error')
    }
  }

  async function handleWithdraw() {
    if (!publicAddress || !withdrawAmount) return
    if (!USDC.address) {
      toast.show('USDC address not configured. Set VITE_USDC_ADDRESS in .env.', 'error')
      return
    }
    try {
      const amount = parseAmount(withdrawAmount, USDC.decimals)
      await withdrawExec([{ token: USDC.address, amount, recipient: publicAddress }])
      await refresh()
      setWithdrawAmount('')
      toast.show('Withdrawal submitted. Balances will update shortly.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Withdrawal failed.', 'error')
    }
  }

  if (!ready || !activeAccount) return null

  // Balances entries — filter zero amounts for cleanliness
  const balanceEntries = Object.entries(balances ?? {}).filter(([, v]) => v > 0n)

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-5">

      {/* ── Section 1: Wallet Overview ───────────────────────────── */}
      <div className="nyx-card p-6">
        <SectionHeader icon={WalletIcon} title="Wallet Overview" />

        <div className="flex flex-wrap gap-2 mb-5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[rgba(108,92,231,0.12)] text-nyx-accent border border-[rgba(108,92,231,0.2)]">
            <ShieldCheck size={10} strokeWidth={2} />
            Private Account
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[rgba(34,197,94,0.08)] text-nyx-success border border-[rgba(34,197,94,0.15)]">
            <Wifi size={10} strokeWidth={2} />
            monad-testnet
          </span>
        </div>

        <p className="text-nyx-muted text-xs uppercase tracking-widest mb-2">ZK Address</p>
        <p className="font-mono text-nyx-text text-sm break-all mb-1">{address}</p>
        <div className="flex items-center gap-3 mt-3">
          <span className="font-mono text-nyx-muted text-xs">{shortenAddress(address)}</span>
          <button
            onClick={handleCopyAddress}
            className="btn-secondary text-xs py-1.5"
          >
            <Copy size={12} strokeWidth={1.5} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Section 2: Private Balances ──────────────────────────── */}
      <div className="nyx-card p-6">
        <SectionHeader icon={ShieldCheck} title="Private Balances" />

        {balancesLoading ? (
          <p className="text-nyx-muted text-sm">Loading balances...</p>
        ) : balanceEntries.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-nyx-muted text-sm">No private assets yet.</p>
            <p className="text-nyx-muted text-xs mt-1">Deposit tokens to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {balanceEntries.map(([tokenAddress, amount]) => {
              const token = getTokenByAddress(tokenAddress)
              const decimals = token?.decimals ?? 18
              const symbol = token?.symbol ?? '???'
              return (
                <div
                  key={tokenAddress}
                  className="flex items-center justify-between px-4 py-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg"
                >
                  <div>
                    <p className="text-nyx-text text-sm font-medium">{symbol}</p>
                    <p className="text-nyx-muted text-[10px] font-mono mt-0.5">{shortenAddress(tokenAddress)}</p>
                  </div>
                  <p className="text-nyx-text font-semibold tabular-nums">
                    {displayAmount(amount, decimals)}
                    <span className="text-nyx-muted font-normal ml-1.5 text-xs">{symbol}</span>
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Public wallet connector (shared by sections 3 & 4) ───── */}
      {!publicAddress ? (
        <div className="nyx-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon size={14} className="text-nyx-muted" strokeWidth={1.5} />
            <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase">
              Public Wallet
            </p>
          </div>
          <p className="text-nyx-muted text-sm mb-4">
            Connect a public EVM wallet (MetaMask) to enable deposits and withdrawals.
          </p>
          <button onClick={connectPublicWallet} className="btn-secondary">
            <LinkIcon size={13} strokeWidth={1.5} />
            Connect Public Wallet
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 nyx-card">
          <span className="w-2 h-2 rounded-full bg-nyx-success flex-shrink-0" />
          <span className="text-nyx-muted text-xs">Public wallet:</span>
          <span className="font-mono text-nyx-text text-xs">{shortenAddress(publicAddress)}</span>
          <button
            onClick={() => setPublicAddress(null)}
            className="ml-auto text-nyx-muted text-xs hover:text-nyx-text transition-colors duration-150"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── Section 3: Fund Private Wallet ───────────────────────── */}
      <div className="nyx-card p-6">
        <SectionHeader icon={ArrowDownToLine} title="Fund Private Wallet" />

        <p className="text-nyx-muted text-sm mb-5">
          Move tokens from your public EVM wallet into your private Unlink account.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Token</label>
            <div className={`${inputCls} text-nyx-muted cursor-default`}>
              USDC{!USDC.address && <span className="text-nyx-danger ml-2 text-xs">— address not configured</span>}
            </div>
          </div>
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Amount</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <div className="flex-shrink-0 flex items-center px-4 bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg text-nyx-muted text-sm font-mono">
                USDC
              </div>
            </div>
          </div>
          {publicAddress && (
            <div>
              <label className="text-xs text-nyx-muted mb-1.5 block">From (public wallet)</label>
              <div className={`${inputCls} font-mono text-nyx-muted cursor-default`}>
                {publicAddress}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleDeposit}
          disabled={depositPending || !publicAddress || !depositAmount}
          className="btn-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <ArrowDownToLine size={14} strokeWidth={1.5} />
          {depositPending ? 'Processing...' : 'Deposit to Private Wallet'}
        </button>

        {!publicAddress && (
          <p className="text-nyx-muted text-xs mt-3 text-center">Connect a public wallet above to enable deposits.</p>
        )}
      </div>

      {/* ── Section 4: Withdraw ──────────────────────────────────── */}
      <div className="nyx-card p-6">
        <SectionHeader icon={ArrowUpFromLine} title="Withdraw" />

        <p className="text-nyx-muted text-sm mb-5">
          Move tokens from your private account back to a public EVM address.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Token</label>
            <div className={`${inputCls} text-nyx-muted cursor-default`}>
              USDC{!USDC.address && <span className="text-nyx-danger ml-2 text-xs">— address not configured</span>}
            </div>
          </div>
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Amount</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <div className="flex-shrink-0 flex items-center px-4 bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg text-nyx-muted text-sm font-mono">
                USDC
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">
              Recipient (public wallet)
            </label>
            <div className={`${inputCls} font-mono text-nyx-muted cursor-default`}>
              {publicAddress ?? <span className="text-nyx-muted/50">Connect a public wallet above</span>}
            </div>
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={withdrawPending || !publicAddress || !withdrawAmount}
          className="btn-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <ArrowUpFromLine size={14} strokeWidth={1.5} />
          {withdrawPending ? 'Processing...' : 'Withdraw'}
        </button>

        {!publicAddress && (
          <p className="text-nyx-muted text-xs mt-3 text-center">Connect a public wallet above to enable withdrawals.</p>
        )}
      </div>

    </main>
  )
}
