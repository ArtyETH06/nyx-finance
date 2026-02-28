import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, ExternalLink, Loader2 } from 'lucide-react'
import type { Invoice } from '../../lib/invoices'
import { normalizeInvoiceRecord } from '../../lib/invoices'
import { buildPaymentReceiptPdf } from '../../lib/receiptPdf'
import { downloadPdf, sha256Blob } from '../../lib/invoicePdf'
import { getTokenByAddress, NATIVE_TOKEN_ADDRESS } from '../../lib/tokens'
import FiatModal from '../../components/fiat/FiatModal'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>
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

  const ethereum = useMemo(() => {
    if (typeof window === 'undefined') return null
    return (window as any).ethereum as EthereumProvider | undefined
  }, [])

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
      setStatusText('Temporary private settlement address created')

      setStatusText('Confirm payment in MetaMask...')
      const valueBigInt = BigInt(String(startData.deposit?.value ?? '0'))
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: payerAddress,
          to: startData.deposit?.to,
          data: startData.deposit?.calldata,
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
        onClose={() => setFiatOpen(false)}
      />
    </main>
  )
}
