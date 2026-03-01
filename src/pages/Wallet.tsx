import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink, useUnlinkBalances, parseAmount } from '@unlink-xyz/react'
import {
  Wifi, ShieldCheck, Wallet as WalletIcon,
  ArrowDownToLine, ArrowUpFromLine, Link as LinkIcon, ChevronDown,
} from 'lucide-react'
import { toast } from '../lib/toast'
import { TOKENS, NATIVE_TOKEN_ADDRESS, getTokenByAddress, displayAmount, shortenAddress, type Token } from '../lib/tokens'

const EXPLORER = 'https://testnet.monadexplorer.com/tx'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MONAD_CHAIN_ID_DEC = 10143
const MONAD_CHAIN_ID_HEX = `0x${MONAD_CHAIN_ID_DEC.toString(16)}`

// ── helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  'nyx-input'

const selectCls = `${inputCls} cursor-pointer pr-8 appearance-none`

function isNativeAddress(address: string): boolean {
  const lower = address.toLowerCase()
  return lower === NATIVE_TOKEN_ADDRESS.toLowerCase() || lower === ZERO_ADDRESS
}

function canonicalTokenAddress(address: string): string {
  return isNativeAddress(address) ? NATIVE_TOKEN_ADDRESS : address
}

function resolveRpcUrl(): string {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MONAD_RPC_URL
  if (configured && configured.trim() && !configured.toLowerCase().includes('quicknode')) {
    return configured.trim()
  }
  return 'https://monad-testnet.g.alchemy.com/v2/lj2xftxNKQ7eSHtLRji-o'
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type WithdrawRelayResult = { txHash?: string; relayId?: string }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isMaxInputsConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.toLowerCase().includes('maxinputs constraint')
}

async function ensureMonadTestnet(ethereum: {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}): Promise<void> {
  const currentChainId = await ethereum.request({ method: 'eth_chainId' }) as string
  if (currentChainId?.toLowerCase() === MONAD_CHAIN_ID_HEX) return

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    })
    return
  } catch (switchErr) {
    const err = switchErr as { code?: number }
    if (err.code !== 4902) {
      throw new Error('Please switch MetaMask to Monad Testnet (chainId 10143)')
    }
  }

  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: MONAD_CHAIN_ID_HEX,
      chainName: 'Monad Testnet',
      nativeCurrency: {
        name: 'MON',
        symbol: 'MON',
        decimals: 18,
      },
      rpcUrls: [resolveRpcUrl()],
      blockExplorerUrls: ['https://testnet.monadexplorer.com'],
    }],
  })
}

async function waitForOnchainConfirmation(
  ethereum: EthereumProvider,
  txHash: string,
  timeoutMs = 180000
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const receipt = await ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }) as { status?: string } | null
    if (receipt) {
      if (receipt.status === '0x1') return
      throw new Error('Deposit transaction failed on-chain')
    }
    await sleep(2000)
  }
  throw new Error('Timed out waiting for deposit confirmation')
}

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
      const result = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      })
      return result ? BigInt(result as string) : 0n
    }
    // ERC-20 — balanceOf(address)
    const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0')
    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
    })
    return result && result !== '0x' ? BigInt(result as string) : 0n
  } catch {
    return 0n
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function Wallet() {
  const navigate = useNavigate()
  const { ready, walletExists, activeAccount, refresh, deposit, withdraw, getTxStatus, forceResync, syncError, busy } = useUnlink()
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
  const [, setPublicWithdrawBalance] = useState<bigint>(0n)

  const address = activeAccount?.address ?? ''

  // Guard
  useEffect(() => {
    if (ready && (!walletExists || !activeAccount)) navigate('/')
  }, [ready, walletExists, activeAccount, navigate])

  // Auto-recover from stale IndexedDB leaf cache (common in prod after protocol upgrades)
  useEffect(() => {
    if (syncError && syncError.includes('inconsistent') && !busy) {
      forceResync()
    }
  }, [syncError, busy, forceResync])

  // Auto-select first withdraw token that has a private balance
  useEffect(() => {
    if (!balances || withdrawToken) return
    const first = TOKENS.find((t) => {
      const key = t.address.toLowerCase()
      if (isNativeAddress(t.address)) {
        return (balances[NATIVE_TOKEN_ADDRESS.toLowerCase()] ?? 0n) > 0n
          || (balances[ZERO_ADDRESS] ?? 0n) > 0n
      }
      return (balances[key] ?? 0n) > 0n
    })
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
      await ensureMonadTestnet(window.ethereum)
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setPublicAddress(accounts[0])
      toast.show('Public wallet connected.')
    } catch {
      toast.show('Wallet connection rejected.', 'error')
    }
  }

  async function refreshAllBalances(token: Token) {
    // Refresh private balances
    await refresh()
    // Refresh public balance for this token in both sections simultaneously
    if (publicAddress) {
      const bal = await fetchPublicBalance(token.address, publicAddress)
      if (token.address === depositToken) setPublicDepositBalance(bal)
      if (token.address === withdrawToken) setPublicWithdrawBalance(bal)
    }
  }

  async function handleDeposit() {
    if (!publicAddress || !depositAmount) return
    const token = getTokenByAddress(depositToken)
    if (!token) return
    setDepositPending(true)
    try {
      const amount = parseAmount(depositAmount, token.decimals)
      const result = await deposit([{ token: token.address, amount, depositor: publicAddress }]) as
        | { relayId?: string; to: string; calldata: string; value?: string | bigint }
        | undefined
      if (!result) throw new Error('No deposit result returned')
      if (!window.ethereum) throw new Error('No wallet provider found')
      await ensureMonadTestnet(window.ethereum)
      const txParams: Record<string, string> = {
        to: result.to,
        data: result.calldata,
        from: publicAddress,
      }
      if (token.isNative) {
        txParams.value = '0x' + amount.toString(16)
      } else if (typeof result.value === 'bigint') {
        txParams.value = `0x${result.value.toString(16)}`
      } else if (result.value) {
        txParams.value = result.value
      }
      const txHash: string = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string

      await waitForOnchainConfirmation(window.ethereum, txHash)
      setDepositAmount('')
      await refreshAllBalances(token)
      toast.show(
        `Deposited ${depositAmount} ${token.symbol} from ${shortenAddress(publicAddress)}`,
        'success',
        txHash ? `${EXPLORER}/${txHash}` : undefined,
      )
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
      const tokenAddress = canonicalTokenAddress(token.address)
      const results: WithdrawRelayResult[] = []
      const queue: bigint[] = [amount]

      while (queue.length > 0) {
        const nextAmount = queue.shift()!
        try {
          const result = await withdraw([{
            token: tokenAddress,
            amount: nextAmount,
            recipient: withdrawRecipient,
          }]) as WithdrawRelayResult | undefined
          results.push(result ?? {})
        } catch (err) {
          if (!isMaxInputsConstraintError(err)) throw err
          if (nextAmount <= 1n || queue.length + results.length >= 8) {
            throw new Error('Withdraw amount is too fragmented for one action. Try a smaller amount (for example Half first).')
          }
          const firstHalf = nextAmount / 2n
          const secondHalf = nextAmount - firstHalf
          if (firstHalf <= 0n || secondHalf <= 0n) {
            throw new Error('Withdraw amount cannot be split further. Try a smaller amount.')
          }
          queue.unshift(secondHalf)
          queue.unshift(firstHalf)
        }
      }

      setWithdrawAmount('')
      await refreshAllBalances(token)
      const result = results[results.length - 1]
      const relayId = result?.relayId
      let txHash = result?.txHash
      if (!txHash && relayId) {
        try {
          const status = await getTxStatus(relayId)
          txHash = status.txHash ?? undefined
        } catch {
          // Keep success toast even if tx status fetch fails; relay id is still useful.
        }
      }
      const relayText = relayId ? ` | Relay ID: ${relayId}` : ''
      const splitText = results.length > 1 ? ` | split into ${results.length} withdrawals` : ''
      toast.show(
        `Withdrew ${withdrawAmount} ${token.symbol} to ${shortenAddress(withdrawRecipient)}${relayText}${splitText}`,
        'success',
        txHash ? `${EXPLORER}/${txHash}` : undefined,
      )
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Withdrawal failed.', 'error')
    } finally {
      setWithdrawPending(false)
    }
  }

  if (!ready || !activeAccount) return null

  // Normalise all balance keys to lowercase so lookups are case-insensitive
  const normBalances: Record<string, bigint> = Object.fromEntries(
    Object.entries(balances ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  )
  const bal = (addr: string) => {
    if (isNativeAddress(addr)) {
      return normBalances[NATIVE_TOKEN_ADDRESS.toLowerCase()] ?? normBalances[ZERO_ADDRESS] ?? 0n
    }
    return normBalances[addr.toLowerCase()] ?? 0n
  }

  const balanceEntries = Object.entries(balances ?? {}).filter(([, v]) => v > 0n)
  const tokensWithBalance = TOKENS.filter(t => bal(t.address) > 0n)

  const selectedDepositToken = getTokenByAddress(depositToken)
  const selectedWithdrawToken = withdrawToken ? getTokenByAddress(withdrawToken) : null
  const privateWithdrawBalance = withdrawToken ? bal(withdrawToken) : 0n

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

        <p className="text-nyx-muted text-xs uppercase tracking-widest mb-2">Unlink Address</p>
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
            <span className="absolute -top-7 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-nyx-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
              Click to copy
            </span>
          )}
        </div>
      </div>

      {/* ── Section 2: Private Balances ──────────────────────────── */}
      <div className="nyx-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-nyx-accent" strokeWidth={1.5} />
            <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase">Private Balances</p>
          </div>
          <button
            onClick={() => forceResync()}
            disabled={busy}
            title="Force full resync from chain"
            className="text-[10px] text-nyx-muted hover:text-nyx-text transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Syncing…' : 'Force Resync'}
          </button>
        </div>

        {syncError && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] text-[11px] text-red-400 break-all">
            Sync error: {syncError}
          </div>
        )}

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
              const token = getTokenByAddress(canonicalTokenAddress(tokenAddress))
              const decimals = token?.decimals ?? 18
              const symbol = token?.symbol ?? '???'
              return (
                <div
                  key={tokenAddress}
                  className="flex items-center justify-between px-4 py-3 bg-nyx-hover border border-nyx-border rounded-lg"
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
              {selectedWithdrawToken && (
                <span className="text-xs text-nyx-muted">
                  Private balance:{' '}
                  <span className="text-nyx-text">
                    {displayAmount(privateWithdrawBalance, selectedWithdrawToken.decimals)} {selectedWithdrawToken.symbol}
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
