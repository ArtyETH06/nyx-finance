import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, ExternalLink, Loader2 } from 'lucide-react'
import { JsonRpcProvider, Wallet, parseUnits } from 'ethers'
import type { Invoice } from '../../lib/invoices'
import { normalizeInvoiceRecord } from '../../lib/invoices'
import { buildPaymentReceiptPdf } from '../../lib/receiptPdf'
import { downloadPdf, sha256Blob } from '../../lib/invoicePdf'
import { getTokenByAddress, NATIVE_TOKEN_ADDRESS } from '../../lib/tokens'
import FiatModal from '../../components/fiat/FiatModal'
import type { MockWalletIdentity } from '../../lib/mockWallets'
import { createEphemeralMonadWallet, getOrCreatePersistentAlchemyPayWallet } from '../../lib/mockWallets'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>
}

function isHexCalldata(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value) && value.length > 2
}

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function resolveRpcUrl(): string {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MONAD_RPC_URL
  if (configured && configured.trim() && !configured.toLowerCase().includes('quicknode')) {
    return configured.trim()
  }
  return 'https://testnet-rpc.monad.xyz'
}

function explorerUrl(txHash: string): string {
  return `https://testnet.monadexplorer.com/tx/${txHash}`
}

function fmtAmount(amount: number, token: string): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token}`
}

function statusLabel(status: Invoice['status']): string {
  if (status === 'paid') return 'Paid'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = abs % base
  const fractionText = fraction.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  const formatted = fractionText ? `${whole.toString()}.${fractionText}` : whole.toString()
  return negative ? `-${formatted}` : formatted
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Payment failed'
}

async function waitForOnchainConfirmation(ethereum: EthereumProvider, txHash: string, timeoutMs = 180000) {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const receipt = await ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }) as { status?: string } | null

    if (receipt) {
      if (receipt.status === '0x1') return
      throw new Error('Transaction failed on-chain')
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Timed out waiting for on-chain confirmation')
}

export default function PayInvoice() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payerAddress, setPayerAddress] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null)
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null)
  const [tokenBalanceText, setTokenBalanceText] = useState<string | null>(null)
  const [fiatOpen, setFiatOpen] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [depositWallet, setDepositWallet] = useState<MockWalletIdentity | null>(null)
  const [alchemySourceAddress, setAlchemySourceAddress] = useState<string | null>(null)
  const [alchemySourcePublicKey, setAlchemySourcePublicKey] = useState<string | null>(null)

  const ethereum = useMemo(() => {
    if (typeof window === 'undefined') return null
    return (window as any).ethereum as EthereumProvider | undefined
  }, [])

  useEffect(() => {
    const depositWallet = createEphemeralMonadWallet()
    setDepositWallet(depositWallet)
    setDepositAddress(depositWallet.address)
    const alchemyWallet = getOrCreatePersistentAlchemyPayWallet()
    setAlchemySourceAddress(alchemyWallet.address)
    setAlchemySourcePublicKey(alchemyWallet.publicKey)
  }, [])

  async function waitForWalletBalance(params: {
    walletAddress: string
    tokenAddress: string
    requiredAmount: bigint
    timeoutMs?: number
  }) {
    const provider = new JsonRpcProvider(resolveRpcUrl())
    const timeoutMs = params.timeoutMs ?? 240000
    const startedAt = Date.now()

    while (Date.now() - startedAt <= timeoutMs) {
      let current = 0n
      if (params.tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
        current = await provider.getBalance(params.walletAddress)
      } else {
        const data = `0x70a08231${params.walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
        const raw = await provider.call({ to: params.tokenAddress, data })
        current = BigInt(raw)
      }
      if (current >= params.requiredAmount) return
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    throw new Error('Timed out waiting for funds on deposit wallet')
  }

  async function autoSettleFromFiatFunding() {
    if (!invoice || !id || !depositWallet) {
      throw new Error('Settlement context is not ready')
    }

    setProcessing(true)
    setError(null)
    try {
      const requiredAmount = parseUnits(invoice.amount.toFixed(18), 18)
      setStatusText('Funding received. Waiting for deposit wallet balance...')
      await waitForWalletBalance({
        walletAddress: depositWallet.address,
        tokenAddress: invoice.tokenAddress,
        requiredAmount,
      })

      setStatusText('Balance detected. Preparing zk deposit...')
      const startRes = await fetch(`/api/contracts/${id}/pay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerAddress: depositWallet.address }),
      })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok) throw new Error(startData.error ?? 'Failed to prepare payment settlement')

      const depositTo = startData.deposit?.to
      const depositCalldata = startData.deposit?.calldata
      if (!isHexAddress(depositTo) || !isHexCalldata(depositCalldata)) {
        console.error('[payment] invalid start payload', {
          lockId: startData.lockId,
          depositTo,
          depositCalldata,
          depositValue: startData.deposit?.value,
        })
        throw new Error('Invalid deposit transaction payload from settlement service')
      }
      console.log('[payment] start payload validated', {
        lockId: startData.lockId,
        depositTo,
        calldataBytes: (depositCalldata.length - 2) / 2,
        depositValue: startData.deposit?.value,
      })

      setStatusText('Submitting deposit to pool from generated wallet...')
      const provider = new JsonRpcProvider(resolveRpcUrl())
      const signer = new Wallet(depositWallet.privateKey, provider)
      const txRequest = {
        from: signer.address,
        to: depositTo,
        data: depositCalldata,
        value: BigInt(String(startData.deposit?.value ?? '0')),
      }
      let gasLimit = 900000n
      try {
        const estimated = await provider.estimateGas(txRequest)
        gasLimit = (estimated * 130n) / 100n + 50000n
      } catch (err) {
        console.warn('[payment] deposit gas estimation failed, using fallback gas limit', {
          error: err instanceof Error ? err.message : String(err),
          fallbackGasLimit: gasLimit.toString(),
        })
      }
      console.log('[payment] broadcasting deposit tx', {
        to: depositTo,
        value: txRequest.value.toString(),
        calldataBytes: (depositCalldata.length - 2) / 2,
        gasLimit: gasLimit.toString(),
      })
      const depositTx = await signer.sendTransaction({
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value,
        gasLimit,
      })
      await depositTx.wait(1)

      setStatusText('Confirming deposit settlement...')
      const confirmRes = await fetch(`/api/contracts/${id}/pay/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lockId: startData.lockId,
          payerAddress: depositWallet.address,
          depositTxHash: depositTx.hash,
        }),
      })
      const confirmData = await confirmRes.json().catch(() => ({}))
      if (!confirmRes.ok) throw new Error(confirmData.error ?? 'Failed to confirm payment')

      const paidInvoice = normalizeInvoiceRecord(confirmData.invoice as Record<string, unknown>)
      setInvoice(paidInvoice)
      const receiptTxHash = paidInvoice.payment?.txHash ?? depositTx.hash
      setConfirmedTxHash(receiptTxHash)

      const receipt = await buildPaymentReceiptPdf({
        invoiceId: paidInvoice.invoiceId,
        amount: paidInvoice.amount,
        token: paidInvoice.tokenSymbol,
        payerAddress: depositWallet.address,
        issuerZkAddress: paidInvoice.issuerAddress,
        txHash: receiptTxHash,
        timestampIso: paidInvoice.payment?.paidAt ?? new Date().toISOString(),
      })
      setReceiptBlob(receipt)

      const receiptHash = await sha256Blob(receipt)
      await fetch(`/api/contracts/${id}/pay/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptHash,
          txHash: receiptTxHash,
          payerAddress: depositWallet.address,
        }),
      })

      setStatusText('Payment confirmed')
    } finally {
      setProcessing(false)
    }
  }

  useEffect(() => {
    async function load() {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/contracts/${id}?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Invoice not found')
        const raw = await res.json() as Record<string, unknown>
        setInvoice(normalizeInvoiceRecord(raw))
      } catch (err) {
        setError(normalizeError(err))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  useEffect(() => {
    async function loadBalance() {
      if (!ethereum || !payerAddress || !invoice) {
        setTokenBalanceText(null)
        return
      }
      try {
        const token = getTokenByAddress(invoice.tokenAddress)
        const decimals = token?.decimals ?? 18
        let balance = 0n
        if (invoice.tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
          const raw = await ethereum.request({
            method: 'eth_getBalance',
            params: [payerAddress, 'latest'],
          }) as string
          balance = BigInt(raw)
        } else {
          const data = `0x70a08231${payerAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
          const raw = await ethereum.request({
            method: 'eth_call',
            params: [{ to: invoice.tokenAddress, data }, 'latest'],
          }) as string
          balance = BigInt(raw)
        }
        setTokenBalanceText(`${formatUnits(balance, decimals)} ${invoice.tokenSymbol}`)
      } catch {
        setTokenBalanceText('Unavailable')
      }
    }
    void loadBalance()
  }, [ethereum, payerAddress, invoice])

  useEffect(() => {
    async function preparePaidReceipt() {
      if (!invoice || invoice.status !== 'paid') return
      const txHash = invoice.payment?.txHash
      if (!txHash) return
      setConfirmedTxHash(txHash)
      if (receiptBlob) return

      try {
        const receipt = await buildPaymentReceiptPdf({
          invoiceId: invoice.invoiceId,
          amount: invoice.amount,
          token: invoice.tokenSymbol,
          payerAddress: invoice.payment?.payerAddress ?? 'payer',
          issuerZkAddress: invoice.issuerAddress,
          txHash,
          timestampIso: invoice.payment?.paidAt ?? invoice.updatedAt ?? invoice.createdAt,
        })
        setReceiptBlob(receipt)
      } catch {
        // ignore receipt generation errors on load
      }
    }
    void preparePaidReceipt()
  }, [invoice, receiptBlob])

  async function connectMetaMask() {
    if (!ethereum) {
      setError('MetaMask is required to pay this invoice')
      return
    }
    try {
      setError(null)
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      setPayerAddress(accounts?.[0] ?? null)
    } catch (err) {
      setError(normalizeError(err))
    }
  }

  async function handlePay() {
    if (!invoice || !id || !payerAddress || !ethereum) return
    setProcessing(true)
    setError(null)
    setStatusText('Processing transaction...')

    try {
      const startRes = await fetch(`/api/contracts/${id}/pay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerAddress }),
      })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok) throw new Error(startData.error ?? 'Failed to prepare payment')
      const depositTo = startData.deposit?.to
      const depositCalldata = startData.deposit?.calldata
      if (!isHexAddress(depositTo) || !isHexCalldata(depositCalldata)) {
        console.error('[payment] invalid start payload', {
          lockId: startData.lockId,
          depositTo,
          depositCalldata,
          depositValue: startData.deposit?.value,
        })
        throw new Error('Invalid deposit transaction payload from settlement service')
      }
      console.log('[payment] start payload validated', {
        lockId: startData.lockId,
        depositTo,
        calldataBytes: (depositCalldata.length - 2) / 2,
        depositValue: startData.deposit?.value,
      })
      setStatusText('Temporary private settlement address created')

      setStatusText('Confirm payment in MetaMask...')
      const valueBigInt = BigInt(String(startData.deposit?.value ?? '0'))
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: payerAddress,
          to: depositTo,
          data: depositCalldata,
          value: `0x${valueBigInt.toString(16)}`,
        }],
      }) as string

      setStatusText('Waiting for confirmation...')
      await waitForOnchainConfirmation(ethereum, txHash)

      setStatusText('Deposit confirmed - relaying private transfer...')
      const confirmRes = await fetch(`/api/contracts/${id}/pay/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lockId: startData.lockId,
          payerAddress,
          depositTxHash: txHash,
        }),
      })
      const confirmData = await confirmRes.json().catch(() => ({}))
      if (!confirmRes.ok) throw new Error(confirmData.error ?? 'Failed to confirm payment')

      const paidInvoice = normalizeInvoiceRecord(confirmData.invoice as Record<string, unknown>)
      setInvoice(paidInvoice)
      const receiptTxHash = paidInvoice.payment?.txHash ?? txHash
      setConfirmedTxHash(receiptTxHash)

      const receipt = await buildPaymentReceiptPdf({
        invoiceId: paidInvoice.invoiceId,
        amount: paidInvoice.amount,
        token: paidInvoice.tokenSymbol,
        payerAddress,
        issuerZkAddress: paidInvoice.issuerAddress,
        txHash: receiptTxHash,
        timestampIso: paidInvoice.payment?.paidAt ?? new Date().toISOString(),
      })
      setReceiptBlob(receipt)

      const receiptHash = await sha256Blob(receipt)
      await fetch(`/api/contracts/${id}/pay/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptHash,
          txHash: receiptTxHash,
          payerAddress,
        }),
      })

      setStatusText('Payment confirmed')
      await new Promise((resolve) => setTimeout(resolve, 100))
      const accounts = await ethereum.request({ method: 'eth_accounts' }) as string[]
      if (accounts?.[0]) setPayerAddress(accounts[0])
    } catch (err) {
      setStatusText(null)
      setError(normalizeError(err))
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 max-w-3xl mx-auto">
        <div className="nyx-card p-6 text-nyx-muted text-sm inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-nyx-accent" />
          Loading payment page...
        </div>
      </main>
    )
  }

  if (error && !invoice) {
    return (
      <main className="px-6 py-10 max-w-3xl mx-auto">
        <div className="nyx-card p-6 border-nyx-danger/30 text-nyx-danger text-sm">{error}</div>
      </main>
    )
  }

  if (!invoice) return null

  const canPay = invoice.status === 'sent' && !!payerAddress && !processing

  return (
    <main className="px-6 py-10 max-w-3xl mx-auto space-y-4">
      <div className="nyx-card p-6 space-y-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Invoice Payment</p>
          <h1 className="text-xl font-semibold text-nyx-text">{invoice.title}</h1>
          {depositAddress && (
            <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-blue-200 mb-0.5">Deposit Address</p>
              <p className="text-xs text-blue-100 break-all">{depositAddress}</p>
            </div>
          )}
          {alchemySourceAddress && (
            <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-200 mb-0.5">AlchemyPay Testnet Wallet</p>
              <p className="text-xs text-emerald-100 break-all">{alchemySourceAddress}</p>
              {alchemySourcePublicKey && (
                <>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-200 mt-2 mb-0.5">Public Key</p>
                  <p className="text-[11px] text-emerald-100/95 break-all">{alchemySourcePublicKey}</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Invoice ID</p>
            <p className="text-nyx-text text-sm">{invoice.invoiceId}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Amount</p>
            <p className="text-nyx-text text-sm">{fmtAmount(invoice.amount, invoice.tokenSymbol)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Status</p>
            <p className="text-nyx-text text-sm uppercase">{statusLabel(invoice.status)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Token Balance</p>
            <p className="text-nyx-text text-sm">{tokenBalanceText ?? 'Connect wallet to load'}</p>
          </div>
        </div>

        {invoice.status === 'paid' && (
          <p className="text-nyx-success text-sm">This invoice has already been paid.</p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={connectMetaMask}
            disabled={processing}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {payerAddress ? 'MetaMask Connected' : 'Connect MetaMask'}
          </button>
          <button
            onClick={handlePay}
            disabled={!canPay}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : `Pay ${fmtAmount(invoice.amount, invoice.tokenSymbol)}`}
          </button>
          <button
            onClick={() => setFiatOpen(true)}
            disabled={processing || invoice.status !== 'sent'}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Pay with Card
          </button>
        </div>

        {statusText && (
          <div className="text-sm text-nyx-muted inline-flex items-center gap-2">
            {processing && <Loader2 size={14} className="animate-spin text-nyx-accent" />}
            <span>{statusText}</span>
          </div>
        )}

        {error && <p className="text-sm text-nyx-danger">{error}</p>}

        {confirmedTxHash && (
          <a
            className="text-sm text-nyx-success inline-flex items-center gap-1.5 underline break-all"
            href={explorerUrl(confirmedTxHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={13} />
            View on Explorer
          </a>
        )}

        {receiptBlob && (
          <button
            className="btn-secondary"
            onClick={() => downloadPdf(receiptBlob, `NYX-Receipt-${invoice.invoiceId}.pdf`)}
          >
            <Download size={13} />
            Download Receipt
          </button>
        )}
      </div>
      <FiatModal
        isOpen={fiatOpen}
        invoiceAmount={invoice.amount}
        invoiceTokenSymbol={invoice.tokenSymbol === 'USDTm' ? 'USDT' : invoice.tokenSymbol}
        depositAddress={depositAddress}
        onSimulatedFunding={async ({ destinationAddress }) => {
          if (!depositWallet) throw new Error('Deposit wallet is not ready')
          if (destinationAddress.toLowerCase() !== depositWallet.address.toLowerCase()) {
            throw new Error('Destination wallet must match generated deposit address')
          }
          try {
            await autoSettleFromFiatFunding()
          } catch (err) {
            setStatusText(null)
            setError(normalizeError(err))
          }
        }}
        onClose={() => setFiatOpen(false)}
      />
    </main>
  )
}
