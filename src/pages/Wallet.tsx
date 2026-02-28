import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink, useUnlinkBalances, parseAmount } from '@unlink-xyz/react'
import {
  Wifi, ShieldCheck, Wallet as WalletIcon,
  ArrowDownToLine, ArrowUpFromLine, Link as LinkIcon, ChevronDown,
} from 'lucide-react'
import { toast } from '../lib/toast'
import { TOKENS, NATIVE_TOKEN_ADDRESS, getTokenByAddress, displayAmount, shortenAddress } from '../lib/tokens'

// ── helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150'

const selectCls = `${inputCls} cursor-pointer pr-8 appearance-none`

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon size={14} className="text-nyx-accent" strokeWidth={1.5} />
      <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase">{title}</p>
    </div>
  )
}

async function fetchPublicBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
  if (!window.ethereum) return 0n
  try {
    // Native MON — use eth_getBalance
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const result: string = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      })
      return result ? BigInt(result) : 0n
    }
    // ERC-20 — balanceOf(address)
    const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
    const result: string = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
    })
    return result && result !== '0x' ? BigInt(result) : 0n
  } catch {
    return 0n
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function Wallet() {
  const navigate = useNavigate()
  const { ready, walletExists, activeAccount, refresh, deposit, withdraw } = useUnlink()
  const { balances, loading: balancesLoading } = useUnlinkBalances()

  const [depositPending, setDepositPending] = useState(false)
  const [withdrawPending, setWithdrawPending] = useState(false)

  const [copied, setCopied] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [publicAddress, setPublicAddress] = useState<string | null>(null)

  // Deposit
  const [depositToken, setDepositToken] = useState(TOKENS[0].address)
  const [depositAmount, setDepositAmount] = useState('')
  const [publicDepositBalance, setPublicDepositBalance] = useState<bigint>(0n)

  // Withdraw
  const [withdrawToken, setWithdrawToken] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [publicWithdrawBalance, setPublicWithdrawBalance] = useState<bigint>(0n)

  const address = activeAccount?.address ?? ''

  // Guard
  useEffect(() => {
    if (ready && (!walletExists || !activeAccount)) navigate('/')
  }, [ready, walletExists, activeAccount, navigate])

  // Auto-select first withdraw token that has a private balance
  useEffect(() => {
    if (!balances || withdrawToken) return
    const first = TOKENS.find(t => (balances[t.address] ?? 0n) > 0n)
    if (first) setWithdrawToken(first.address)
  }, [balances, withdrawToken])

  // Fetch public balance for selected deposit token
  useEffect(() => {
    if (!publicAddress || !depositToken) { setPublicDepositBalance(0n); return }
    fetchPublicBalance(depositToken, publicAddress).then(setPublicDepositBalance)
  }, [publicAddress, depositToken])

  // Fetch public balance for selected withdraw token
  useEffect(() => {
    if (!publicAddress || !withdrawToken) { setPublicWithdrawBalance(0n); return }
    fetchPublicBalance(withdrawToken, publicAddress).then(setPublicWithdrawBalance)
  }, [publicAddress, withdrawToken])

  async function handleCopyAddress() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Pre-fill withdraw recipient when public wallet connects (but leave editable)
  useEffect(() => {
    if (publicAddress && !withdrawRecipient) setWithdrawRecipient(publicAddress)
  }, [publicAddress, withdrawRecipient])

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
    const token = getTokenByAddress(depositToken)
    if (!token) return
    setDepositPending(true)
    try {
      const amount = parseAmount(depositAmount, token.decimals)
      // deposit() returns DepositRelayResult: { to, calldata, value? }
      const result = await deposit([{ token: token.address, amount, depositor: publicAddress }]) as
        | { to: string; calldata: string; value?: string }
        | undefined
      if (!result) throw new Error('No deposit result returned')
      if (!window.ethereum) throw new Error('No wallet provider found')
      const txParams: Record<string, string> = {
        to: result.to,
        data: result.calldata,
        from: publicAddress,
      }
      // Native token deposits require sending the token amount as tx value
      if (token.isNative) {
        txParams.value = '0x' + amount.toString(16)
      } else if (result.value) {
        txParams.value = result.value
      }
      await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      })
      await refresh()
      setDepositAmount('')
      toast.show('Deposit submitted. Balances will update shortly.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Deposit failed.', 'error')
    } finally {
      setDepositPending(false)
    }
  }

  async function handleWithdraw() {
    if (!withdrawRecipient || !withdrawAmount || !withdrawToken) return
    const token = getTokenByAddress(withdrawToken)
    if (!token) return
    setWithdrawPending(true)
    try {
      const amount = parseAmount(withdrawAmount, token.decimals)
      await withdraw([{ token: token.address, amount, recipient: withdrawRecipient }])
      await refresh()
      setWithdrawAmount('')
      toast.show('Withdrawal submitted. Balances will update shortly.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Withdrawal failed.', 'error')
    } finally {
      setWithdrawPending(false)
    }
  }

  if (!ready || !activeAccount) return null

  const balanceEntries = Object.entries(balances ?? {}).filter(([, v]) => v > 0n)
  const tokensWithBalance = TOKENS.filter(t => (balances?.[t.address] ?? 0n) > 0n)

  const selectedDepositToken = getTokenByAddress(depositToken)
  const selectedWithdrawToken = withdrawToken ? getTokenByAddress(withdrawToken) : null
  const privateWithdrawBalance = withdrawToken ? (balances?.[withdrawToken] ?? 0n) : 0n

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
        <div
          className="relative group cursor-pointer inline-block w-full"
          onClick={handleCopyAddress}
        >
          <p className={`font-mono text-sm break-all transition-colors duration-150 select-none ${
            copied ? 'text-nyx-success' : 'text-nyx-text group-hover:text-nyx-accent'
          }`}>
            {copied ? 'Copied!' : address}
          </p>
          {!copied && (
            <span className="absolute -top-7 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-[rgba(255,255,255,0.08)] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
              Click to copy
            </span>
          )}
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
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(tokenAddress)
                        setCopiedToken(tokenAddress)
                        setTimeout(() => setCopiedToken(null), 1500)
                      }}
                      title={tokenAddress}
                      className={`text-[10px] font-mono mt-0.5 transition-colors duration-150 cursor-copy ${
                        copiedToken === tokenAddress
                          ? 'text-nyx-success'
                          : 'text-nyx-muted hover:text-nyx-text'
                      }`}
                    >
                      {copiedToken === tokenAddress ? 'Copied!' : shortenAddress(tokenAddress)}
                    </button>
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

      {/* ── Public wallet connector ───────────────────────────────── */}
      {!publicAddress ? (
        <div className="nyx-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon size={14} className="text-nyx-muted" strokeWidth={1.5} />
            <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase">Public Wallet</p>
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
          {/* Token dropdown */}
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Token</label>
            <div className="relative">
              <select
                value={depositToken}
                onChange={(e) => { setDepositToken(e.target.value); setDepositAmount('') }}
                className={selectCls}
              >
                {TOKENS.map(t => (
                  <option key={t.address} value={t.address} style={{ backgroundColor: '#0E1428' }}>
                    {t.symbol}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-nyx-muted pointer-events-none" strokeWidth={1.5} />
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-nyx-muted">Amount</label>
              {publicAddress && selectedDepositToken && (
                <span className="text-xs text-nyx-muted">
                  Balance:{' '}
                  <span className="text-nyx-text">
                    {displayAmount(publicDepositBalance, selectedDepositToken.decimals)} {selectedDepositToken.symbol}
                  </span>
                </span>
              )}
            </div>
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
              {publicAddress && selectedDepositToken && publicDepositBalance > 0n && (
                <>
                  <button
                    onClick={() => setDepositAmount(displayAmount(publicDepositBalance / 2n, selectedDepositToken.decimals))}
                    className="btn-secondary flex-shrink-0 px-3 text-xs"
                  >
                    Half
                  </button>
                  <button
                    onClick={() => setDepositAmount(displayAmount(publicDepositBalance, selectedDepositToken.decimals))}
                    className="btn-secondary flex-shrink-0 px-3 text-xs"
                  >
                    Max
                  </button>
                </>
              )}
            </div>
          </div>

          {publicAddress && (
            <div>
              <label className="text-xs text-nyx-muted mb-1.5 block">From (public wallet)</label>
              <div className={`${inputCls} font-mono text-nyx-muted/50 cursor-not-allowed select-none opacity-60`}>
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
          {/* Token dropdown — only tokens with private balance */}
          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Token</label>
            {tokensWithBalance.length === 0 ? (
              <div className={`${inputCls} text-nyx-muted/50 cursor-default`}>No tokens available</div>
            ) : (
              <div className="relative">
                <select
                  value={withdrawToken}
                  onChange={(e) => { setWithdrawToken(e.target.value); setWithdrawAmount('') }}
                  className={selectCls}
                >
                  {tokensWithBalance.map(t => (
                    <option key={t.address} value={t.address} style={{ backgroundColor: '#0E1428' }}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-nyx-muted pointer-events-none" strokeWidth={1.5} />
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-nyx-muted">Amount</label>
              {publicAddress && selectedWithdrawToken && publicWithdrawBalance > 0n && (
                <span className="text-xs text-nyx-muted">
                  Wallet:{' '}
                  <span className="text-nyx-text">
                    {displayAmount(publicWithdrawBalance, selectedWithdrawToken.decimals)} {selectedWithdrawToken.symbol}
                  </span>
                </span>
              )}
            </div>
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
              {selectedWithdrawToken && privateWithdrawBalance > 0n && (
                <>
                  <button
                    onClick={() => setWithdrawAmount(displayAmount(privateWithdrawBalance / 2n, selectedWithdrawToken.decimals))}
                    className="btn-secondary flex-shrink-0 px-3 text-xs"
                  >
                    Half
                  </button>
                  <button
                    onClick={() => setWithdrawAmount(displayAmount(privateWithdrawBalance, selectedWithdrawToken.decimals))}
                    className="btn-secondary flex-shrink-0 px-3 text-xs"
                  >
                    Max
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-nyx-muted mb-1.5 block">Recipient address</label>
            <input
              className={`${inputCls} font-mono`}
              type="text"
              placeholder="0x..."
              value={withdrawRecipient}
              onChange={(e) => setWithdrawRecipient(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={withdrawPending || !withdrawRecipient || !withdrawAmount || !withdrawToken}
          className="btn-primary mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <ArrowUpFromLine size={14} strokeWidth={1.5} />
          {withdrawPending ? 'Processing...' : 'Withdraw'}
        </button>

      </div>

    </main>
  )
}
