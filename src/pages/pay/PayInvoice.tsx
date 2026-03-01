import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Download, ExternalLink, Loader2 } from 'lucide-react'
import { JsonRpcProvider, Wallet, parseUnits } from 'ethers'
import type { Invoice } from '../../lib/invoices'
import {
  fmtPartyName,
  formatDueDate,
  formatIssueDate,
  normalizeInvoiceRecord,
} from '../../lib/invoices'
import { buildInvoicePdf, downloadPdf, sha256Blob } from '../../lib/invoicePdf'
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

function fmtAmount(amount: number, token: string, prefixDollar = false): string {
  const sym = prefixDollar ? (token.startsWith('$') ? token : `$${token}`) : token
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`
}

function fmtLineMeta(item: Invoice['lineItems'][number], token: string): string | null {
  void token
  if (!item.quantity) return null
  return `Qty ${item.quantity}`
}

function statusLabel(status: Invoice['status']): string {
  if (status === 'paid') return 'Paid'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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

async function readJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const raw = await res.text()
  let data: Record<string, unknown> | null = null
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const message =
      (data?.error as string | undefined) ??
      (data?.message as string | undefined) ??
      `${fallbackError} (HTTP ${res.status})`
    throw new Error(message)
  }

  if (!data) {
    throw new Error(`${fallbackError}: received a non-JSON response`)
  }

  return data as T
}

async function retryTx<T>(label: string, fn: () => Promise<T>, retries = 2, delayMs = 1200): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        console.log('retrying tx...', {
          label,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        })
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Transaction failed')
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
  const [statusTone, setStatusTone] = useState<'muted' | 'success'>('muted')
  const [processingDots, setProcessingDots] = useState(0)
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null)
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null)
  const [tokenBalanceText, setTokenBalanceText] = useState<string | null>(null)
  const [fiatOpen, setFiatOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'metamask' | 'alchemy'>('metamask')
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [depositWallet, setDepositWallet] = useState<MockWalletIdentity | null>(null)
  const [rejectReasonInput, setRejectReasonInput] = useState('')

  const ethereum = useMemo(() => {
    if (typeof window === 'undefined') return null
    return (window as any).ethereum as EthereumProvider | undefined
  }, [])

  useEffect(() => {
    const depositWallet = createEphemeralMonadWallet()
    setDepositWallet(depositWallet)
    setDepositAddress(depositWallet.address)
    getOrCreatePersistentAlchemyPayWallet()
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

  async function buildPaidInvoiceBlob(paidInvoice: Invoice, _payerAddress: string): Promise<Blob> {
    const paidPdf = await buildInvoicePdf({
      invoiceId: paidInvoice.invoiceId,
      title: paidInvoice.title,
      issueDate: formatIssueDate(paidInvoice.createdAt),
      dueDate: formatDueDate(paidInvoice.createdAt, paidInvoice.dueDate),
      issuerAddress: paidInvoice.issuerAddress,
      issuerInfo: paidInvoice.issuerInfo,
      payerAddress: '',
      payerInfo: paidInvoice.payerInfo,
      lineItems: paidInvoice.lineItems,
      tokenSymbol: paidInvoice.tokenSymbol,
      status: 'paid',
      payment: paidInvoice.payment,
    })
    return paidPdf.output('blob')
  }

  async function autoSettleFromFiatFunding() {
    if (!invoice || !id || !depositWallet) {
      throw new Error('Settlement context is not ready')
    }

    setProcessing(true)
    setStatusTone('muted')
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
      const startData = await readJsonResponse<Record<string, any>>(
        startRes,
        'Failed to prepare payment settlement'
      )

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
      const depositTx = await retryTx('alchemy-auto-deposit', () =>
        signer.sendTransaction({
          to: txRequest.to,
          data: txRequest.data,
          value: txRequest.value,
          gasLimit,
        })
      )
      await retryTx('alchemy-auto-deposit-confirmation', async () => {
        await depositTx.wait(1)
      })

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
      const confirmData = await readJsonResponse<Record<string, any>>(
        confirmRes,
        'Failed to confirm payment'
      )

      const paidInvoice = normalizeInvoiceRecord(confirmData.invoice as Record<string, unknown>)
      setInvoice(paidInvoice)
      const receiptTxHash = paidInvoice.payment?.txHash ?? depositTx.hash
      setConfirmedTxHash(receiptTxHash)

      const receipt = await buildPaidInvoiceBlob(paidInvoice, depositWallet.address)
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

      setStatusText(null)
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
        const raw = await readJsonResponse<Record<string, unknown>>(res, 'Invoice not found')
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
    if (!processing) return
    setProcessingDots(0)
    const timer = window.setInterval(() => {
      setProcessingDots((prev) => (prev + 1) % 3)
    }, 350)
    return () => window.clearInterval(timer)
  }, [processing])

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
        setTokenBalanceText(`${formatUnits(balance, decimals)} $${invoice.tokenSymbol}`)
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
        const receipt = await buildPaidInvoiceBlob(
          invoice,
          invoice.payment?.payerAddress ?? invoice.payerAddress ?? 'payer'
        )
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
    setStatusTone('muted')
    setError(null)
    setStatusText('Processing transaction...')

    try {
      const startRes = await fetch(`/api/contracts/${id}/pay/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerAddress }),
      })
      const startData = await readJsonResponse<Record<string, any>>(startRes, 'Failed to prepare payment')
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
      const confirmData = await readJsonResponse<Record<string, any>>(confirmRes, 'Failed to confirm payment')

      const paidInvoice = normalizeInvoiceRecord(confirmData.invoice as Record<string, unknown>)
      setInvoice(paidInvoice)
      const receiptTxHash = paidInvoice.payment?.txHash ?? txHash
      setConfirmedTxHash(receiptTxHash)

      const receipt = await buildPaidInvoiceBlob(paidInvoice, payerAddress)
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

      setStatusText(null)
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

  async function handleRejectContract() {
    if (!invoice || !id || processing) return

    const rejectionReason = rejectReasonInput.trim()
    if (!rejectionReason) {
      setError('Please provide a reason for rejecting this invoice')
      return
    }

    setProcessing(true)
    setError(null)
    setStatusTone('muted')
    setStatusText('Submitting rejection...')

    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason,
        }),
      })

      const data = await readJsonResponse<Record<string, unknown>>(
        res,
        'Failed to reject invoice'
      )

      const updatedRaw = (data.invoice as Record<string, unknown> | undefined) ?? data
      const updatedInvoice = normalizeInvoiceRecord(updatedRaw)
      setInvoice(updatedInvoice)
      setRejectReasonInput(updatedInvoice.rejectionReason ?? rejectionReason)
      setStatusText(null)
    } catch (err) {
      setStatusText(null)
      setError(normalizeError(err))
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center">
        <div className="text-nyx-muted text-sm inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-nyx-accent" />
          <span>Loading payment page</span>
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

  const isPayable = invoice.status === 'sent'
  const canExecuteMetamaskPay = isPayable && !!payerAddress && !processing
  const interactionLocked = processing || statusTone === 'success'
  const methodSelectionLocked = interactionLocked || !isPayable
  const processingLabel = `Processing${['.', '..', '...'][processingDots]}`
  const issueDate = formatIssueDate(invoice.createdAt)
  const dueDate = formatDueDate(invoice.createdAt, invoice.dueDate)
  const totalFromLines = invoice.lineItems.reduce((acc, item) => acc + item.amount, 0)
  const payerName = fmtPartyName(invoice.payerInfo)
  const issuerName = fmtPartyName(invoice.issuerInfo)
  const primaryButtonLabel = processing
    ? processingLabel
    : paymentMethod === 'metamask'
      ? (payerAddress ? `Pay ${fmtAmount(invoice.amount, invoice.tokenSymbol, true)}` : 'Connect MetaMask')
      : `Pay ${fmtAmount(invoice.amount, invoice.tokenSymbol, true)}`

  async function handlePrimaryPaymentAction() {
    if (!isPayable || interactionLocked) return
    if (paymentMethod === 'alchemy') {
      setFiatOpen(true)
      return
    }
    if (!payerAddress) {
      await connectMetaMask()
      return
    }
    await handlePay()
  }

  async function handleDownloadInvoice() {
    const currentInvoice = invoice
    if (!currentInvoice) return
    try {
      const doc = await buildInvoicePdf({
        invoiceId: currentInvoice.invoiceId,
        title: currentInvoice.title,
        issueDate,
        dueDate,
        issuerAddress: currentInvoice.issuerAddress,
        issuerInfo: currentInvoice.issuerInfo,
        payerAddress: '',
        payerInfo: currentInvoice.payerInfo,
        lineItems: currentInvoice.lineItems,
        tokenSymbol: currentInvoice.tokenSymbol,
        status: currentInvoice.status,
        payment: currentInvoice.payment,
      })
      const blob = doc.output('blob')
      downloadPdf(blob, `NYX-Invoice-${currentInvoice.invoiceId}.pdf`)
    } catch (err) {
      setError(normalizeError(err))
    }
  }

  const statusClass =
    invoice.status === 'paid'
      ? 'text-nyx-success'
      : invoice.status === 'rejected'
        ? 'text-nyx-danger'
        : 'text-[#92400E]'

  return (
    <main className="px-6 py-10 min-h-[calc(100vh-220px)] flex items-center justify-center">
      <div className="nyx-card p-6 space-y-5 w-full max-w-2xl">
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
            <p className="text-nyx-text text-sm">
              <code className="font-mono text-[12px] text-nyx-text">
                {`${invoice.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $${invoice.tokenSymbol}`}
              </code>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Status</p>
            <p className={`text-sm uppercase ${statusClass}`}>{statusLabel(invoice.status)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Token Balance</p>
            <p className="text-nyx-text text-sm">{tokenBalanceText ?? 'Connect wallet to load'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Issued</p>
            <p className="text-nyx-text text-sm">{formatDateTime(invoice.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Due Date</p>
            <p className="text-nyx-text text-sm">{dueDate}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-nyx-border bg-nyx-hover p-3">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Issuer</p>
            <p className="text-sm text-nyx-text font-medium">{issuerName}</p>
            {invoice.issuerInfo?.company && (
              <p className="text-xs text-nyx-muted">{invoice.issuerInfo.company}</p>
            )}
          </div>
          <div className="rounded-lg border border-nyx-border bg-nyx-hover p-3">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Payer</p>
            <p className="text-sm text-nyx-text font-medium">{payerName}</p>
            {invoice.payerInfo?.company && (
              <p className="text-xs text-nyx-muted">{invoice.payerInfo.company}</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-nyx-border bg-nyx-hover p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted">Service Breakdown</p>
          <div className="space-y-2">
            {invoice.lineItems.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-nyx-text font-medium">{item.title}</p>
                  <p className="text-xs text-nyx-muted break-words">{item.description}</p>
                  {fmtLineMeta(item, invoice.tokenSymbol) && (
                    <p className="text-[11px] text-nyx-muted mt-1 font-mono">{fmtLineMeta(item, invoice.tokenSymbol)}</p>
                  )}
                </div>
                <p className="text-sm text-nyx-text font-mono whitespace-nowrap">{fmtAmount(item.amount, invoice.tokenSymbol)}</p>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-nyx-border flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-nyx-muted">Total</p>
            <p className="text-sm text-nyx-text font-semibold">{fmtAmount(totalFromLines || invoice.amount, invoice.tokenSymbol, true)}</p>
          </div>
        </div>

        {invoice.status !== 'paid' && (
          <div>
            <button
              className="btn-secondary inline-flex w-max whitespace-nowrap"
              onClick={handleDownloadInvoice}
            >
              <Download size={13} />
              <span className="whitespace-nowrap">Download Invoice</span>
            </button>
          </div>
        )}

        {invoice.status === 'rejected' && (
          <div className="rounded-lg border border-nyx-danger/35 bg-[rgba(239,68,68,0.08)] px-3 py-2">
            <p className="text-nyx-danger text-sm font-medium">This invoice has been rejected.</p>
            {invoice.rejectionReason && (
              <p className="text-nyx-muted text-sm mt-1">{invoice.rejectionReason}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted">Payment Method</p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                if (methodSelectionLocked) return
                setPaymentMethod('metamask')
              }}
              disabled={methodSelectionLocked}
              className={[
                'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                'flex items-center justify-between gap-3',
                paymentMethod === 'metamask'
                  ? 'border-nyx-accent bg-nyx-active'
                  : 'border-nyx-border bg-nyx-card hover:bg-nyx-hover',
                methodSelectionLocked ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-nyx-hover flex items-center justify-center text-lg">
                  🦊
                </div>
                <div className="min-w-0">
                  <p className="text-nyx-text text-base font-semibold">MetaMask</p>
                  <p className="text-nyx-muted text-sm">Crypto wallet payment</p>
                </div>
              </div>
              <div
                className={[
                  'h-4 w-4 rounded-full border',
                  paymentMethod === 'metamask'
                    ? 'border-nyx-accent bg-nyx-accent'
                    : 'border-nyx-border bg-transparent',
                ].join(' ')}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                if (methodSelectionLocked) return
                setPaymentMethod('alchemy')
              }}
              disabled={methodSelectionLocked}
              className={[
                'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                'flex items-center justify-between gap-3',
                paymentMethod === 'alchemy'
                  ? 'border-nyx-accent bg-nyx-active'
                  : 'border-nyx-border bg-nyx-card hover:bg-nyx-hover',
                methodSelectionLocked ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-nyx-hover flex items-center justify-center text-lg">
                  💳
                </div>
                <div className="min-w-0">
                  <p className="text-nyx-text text-base font-semibold">AlchemyPay Testnet</p>
                  <p className="text-nyx-muted text-sm">Card payment simulation</p>
                </div>
              </div>
              <div
                className={[
                  'h-4 w-4 rounded-full border',
                  paymentMethod === 'alchemy'
                    ? 'border-nyx-accent bg-nyx-accent'
                    : 'border-nyx-border bg-transparent',
                ].join(' ')}
              />
            </button>
          </div>

          <div className="min-h-[42px]">
            <button
              onClick={handlePrimaryPaymentAction}
              disabled={
                interactionLocked ||
                !isPayable ||
                (paymentMethod === 'metamask' && !!payerAddress && !canExecuteMetamaskPay)
              }
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {invoice.status === 'paid' ? 'Paid !' : primaryButtonLabel}
            </button>
          </div>

          {isPayable && (
            <div className="space-y-2 rounded-lg border border-nyx-danger/25 bg-[rgba(239,68,68,0.06)] p-3">
              <p className="text-[10px] uppercase tracking-widest text-nyx-danger">Refuse Contract</p>
              <textarea
                value={rejectReasonInput}
                onChange={(event) => setRejectReasonInput(event.target.value)}
                placeholder="Reason for refusal"
                maxLength={500}
                className="w-full rounded-lg border border-nyx-danger/40 bg-nyx-card px-3 py-2 text-sm text-nyx-text placeholder:text-nyx-muted outline-none focus:border-nyx-danger min-h-[88px]"
                disabled={interactionLocked}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-nyx-muted">{rejectReasonInput.trim().length}/500</p>
                <button
                  type="button"
                  onClick={handleRejectContract}
                  disabled={interactionLocked || rejectReasonInput.trim().length === 0}
                  className="btn-secondary border-nyx-danger/40 text-nyx-danger hover:bg-[rgba(239,68,68,0.12)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Refuse with reason
                </button>
              </div>
            </div>
          )}
        </div>

        {statusText && !confirmedTxHash && (
          <div
            className={[
              'text-sm inline-flex items-center gap-2 rounded-md px-2.5 py-1.5',
              statusTone === 'success'
                ? 'bg-[rgba(34,197,94,0.12)] text-nyx-success'
                : 'text-nyx-muted',
            ].join(' ')}
          >
            {statusTone === 'success' ? (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-nyx-success text-white">
                <Check size={11} strokeWidth={2.5} />
              </span>
            ) : (
              processing && <Loader2 size={14} className="animate-spin text-nyx-accent" />
            )}
            <span>{statusTone === 'success' ? `${statusText} confirmed` : statusText}</span>
          </div>
        )}

        {error && <p className="text-sm text-nyx-danger">{error}</p>}

        {(confirmedTxHash || receiptBlob) && (
          <div className="space-y-3">
            {confirmedTxHash && (
              <div className="text-sm text-nyx-muted flex items-center gap-2 break-all">
                <span>Payment confirmed</span>
                <a
                  className="inline-flex items-center gap-1.5 underline text-nyx-success"
                  href={explorerUrl(confirmedTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={13} />
                  View on Explorer
                </a>
              </div>
            )}

            {receiptBlob && (
              <button
                className="btn-secondary inline-flex w-max whitespace-nowrap"
                onClick={() => downloadPdf(receiptBlob, `NYX-Invoice-${invoice.invoiceId}-PAID.pdf`)}
              >
                <Download size={13} />
                <span className="whitespace-nowrap">Download Receipt</span>
              </button>
            )}
          </div>
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
            setStatusTone('success')
            setStatusText('AlchemyPay transfer')
            await new Promise((resolve) => setTimeout(resolve, 2000))
            setStatusTone('muted')
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
