import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseAmount, useUnlink } from '@unlink-xyz/react'
import { ArrowLeft, Check, CircleDollarSign, Download, Loader2, X } from 'lucide-react'
import { toast } from '../../lib/toast'
import type { Invoice } from '../../lib/invoices'
import { fmtPartyName, formatIssueDate } from '../../lib/invoices'
import { buildInvoicePdf, downloadPdf, sha256Blob } from '../../lib/invoicePdf'
import { USDC, USDT, NATIVE_TOKEN_ADDRESS, getTokenByAddress } from '../../lib/tokens'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fmtMoney(amount: number, symbol: string) {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`
}

function shortAddress(address: string) {
  if (address.length < 16) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function normalizeInvoice(raw: Record<string, unknown>): Invoice {
  const legacyCurrency = String(raw.currencySymbol ?? raw.tokenSymbol ?? raw.currency ?? 'USDCm')
  let tokenAddress = typeof raw.tokenAddress === 'string' ? raw.tokenAddress : ''
  let tokenSymbol = typeof raw.tokenSymbol === 'string' ? raw.tokenSymbol : legacyCurrency

  if (!tokenAddress) {
    if (legacyCurrency === 'USDTm') {
      tokenAddress = USDT.address
      tokenSymbol = 'USDTm'
    } else if (legacyCurrency === 'MON') {
      tokenAddress = NATIVE_TOKEN_ADDRESS
      tokenSymbol = 'MON'
    } else {
      tokenAddress = USDC.address
      tokenSymbol = 'USDCm'
    }
  }

  return {
    _id: String(raw._id ?? ''),
    invoiceId: String(raw.invoiceId ?? raw._id ?? ''),
    issuerAddress: String(raw.issuerAddress ?? ''),
    payerAddress: String(raw.payerAddress ?? ''),
    issuerInfo: (raw.issuerInfo as Invoice['issuerInfo']) ?? undefined,
    payerInfo: (raw.payerInfo as Invoice['payerInfo']) ?? undefined,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    amount: Number(raw.amount ?? 0),
    tokenAddress,
    tokenSymbol,
    currencySymbol: typeof raw.currencySymbol === 'string' ? raw.currencySymbol : tokenSymbol,
    status: (raw.status as Invoice['status']) ?? 'sent',
    rejectionReason: (raw.rejectionReason as string | null) ?? null,
    pdfHash: String(raw.pdfHash ?? ''),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    payment: (raw.payment as Invoice['payment']) ?? undefined,
  }
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeAccount, send, deposit, waitForConfirmation, refresh, balances } = useUnlink()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [publicAddress, setPublicAddress] = useState<string | null>(null)
  const [txStatusText, setTxStatusText] = useState<string | null>(null)

  const balancesRef = useRef(balances)
  useEffect(() => { balancesRef.current = balances }, [balances])

  const address = activeAccount?.address ?? ''
  const isIssuer = !!invoice && invoice.issuerAddress === address
  const isPayer = !!invoice && invoice.payerAddress === address

  const token = useMemo(
    () => (invoice ? getTokenByAddress(invoice.tokenAddress) : undefined),
    [invoice]
  )
  const tokenDecimals = token?.decimals ?? 18
  const tokenAddress = invoice?.tokenAddress ?? ''
  const privateTokenBalance = useMemo(
    () => (tokenAddress ? balances[tokenAddress] ?? 0n : 0n),
    [balances, tokenAddress]
  )
  const requiredAmount = useMemo(() => {
    if (!invoice) return 0n
    return parseAmount(String(invoice.amount), tokenDecimals)
  }, [invoice, tokenDecimals])

  const loadInvoice = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${id}`)
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        setInvoice(normalizeInvoice(data))
        return
      }

      // Backward compatibility for older API versions that don't expose
      // GET /api/contracts/:id (or return 404 for legacy id formats).
      if (res.status === 404 && address) {
        const listRes = await fetch(`/api/contracts?address=${encodeURIComponent(address)}`)
        if (!listRes.ok) throw new Error('Failed to load invoice')
        const listRaw = await listRes.json() as Record<string, unknown>[]
        const list = listRaw.map(normalizeInvoice)
        const match = list.find((inv) => inv._id === id || inv.invoiceId === id)
        if (match) {
          setInvoice(match)
          return
        }
      }

      throw new Error('Failed to load invoice')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id, address])

  useEffect(() => { void loadInvoice() }, [loadInvoice])

  async function patchInvoice(patch: Record<string, unknown>) {
    if (!id) return
    const res = await fetch(`/api/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to update invoice')
    }
    const data = await res.json()
    setInvoice(data.invoice as Invoice)
  }

  async function handleAccept() {
    setBusy(true)
    setTxStatusText('Waiting for API confirmation...')
    try {
      await patchInvoice({ status: 'accepted', rejectionReason: null })
      toast.show('Invoice accepted.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Accept failed', 'error')
    } finally {
      setBusy(false)
      setTxStatusText(null)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.show('Rejection reason is required.', 'error')
      return
    }
    setBusy(true)
    setTxStatusText('Waiting for API confirmation...')
    try {
      await patchInvoice({ status: 'rejected', rejectionReason: rejectReason.trim() })
      setShowReject(false)
      setRejectReason('')
      toast.show('Invoice rejected.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Reject failed', 'error')
    } finally {
      setBusy(false)
      setTxStatusText(null)
    }
  }

  async function connectPublicWallet() {
    if (!window.ethereum) {
      toast.show('No wallet detected. Please install MetaMask.', 'error')
      return
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
    setPublicAddress(accounts[0] ?? null)
  }

  async function waitForPublicTxConfirmation(txHash: string): Promise<void> {
    if (!window.ethereum) throw new Error('No wallet provider found')
    const maxTries = 60
    for (let i = 0; i < maxTries; i += 1) {
      const receipt = await window.ethereum.request({
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

  async function waitForPrivateFunds(required: bigint): Promise<boolean> {
    const maxTries = 30
    for (let i = 0; i < maxTries; i += 1) {
      await refresh()
      if ((balancesRef.current[tokenAddress] ?? 0n) >= required) return true
      await sleep(1500)
    }
    return false
  }

  async function executePaymentFlow() {
    if (!invoice) return
    setTxStatusText('Sending private payment...')
    const result = await send([{
      token: tokenAddress,
      recipient: invoice.issuerAddress,
      amount: requiredAmount,
    }])

    setTxStatusText('Waiting for Unlink confirmation...')
    const status = await waitForConfirmation(result.relayId, { timeout: 180000 })

    setTxStatusText('Updating invoice status...')
    await patchInvoice({
      status: 'paid',
      rejectionReason: null,
      payment: {
        relayId: result.relayId,
        txHash: status.txHash,
        paidAt: new Date().toISOString(),
      },
    })

    await refresh()
    toast.show(
      `Payment confirmed. Relay ID: ${result.relayId}`,
      'success',
      status.txHash ? `https://testnet.monadexplorer.com/tx/${status.txHash}` : undefined,
    )
  }

  async function handlePay() {
    if (!invoice) return
    if (invoice.status === 'paid') return

    setBusy(true)
    try {
      const localBalance = balancesRef.current[tokenAddress] ?? 0n
      if (localBalance < requiredAmount) {
        setShowFundModal(true)
        return
      }
      await executePaymentFlow()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Payment failed', 'error')
    } finally {
      setBusy(false)
      setTxStatusText(null)
    }
  }

  async function fundAndPay() {
    if (!publicAddress || !invoice) return
    setBusy(true)
    try {
      const localBalance = balancesRef.current[tokenAddress] ?? 0n
      const missing = requiredAmount > localBalance ? requiredAmount - localBalance : 0n
      if (missing <= 0n) {
        setShowFundModal(false)
        await executePaymentFlow()
        return
      }

      setTxStatusText('Preparing deposit...')
      const depositResult = await deposit([{ token: tokenAddress, amount: missing, depositor: publicAddress }]) as
        | { to: string; calldata: string; value?: string | bigint }
        | undefined
      if (!depositResult) throw new Error('No deposit payload returned')
      if (!window.ethereum) throw new Error('No wallet provider found')

      const txParams: Record<string, string> = {
        to: depositResult.to,
        data: depositResult.calldata,
        from: publicAddress,
      }
      if (typeof depositResult.value === 'bigint') {
        txParams.value = `0x${depositResult.value.toString(16)}`
      } else if (typeof depositResult.value === 'string') {
        txParams.value = depositResult.value
      }

      setTxStatusText('Submitting deposit transaction...')
      const depositTxHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string

      setTxStatusText('Waiting for deposit confirmation...')
      await waitForPublicTxConfirmation(depositTxHash)

      setTxStatusText('Refreshing private balance...')
      const funded = await waitForPrivateFunds(requiredAmount)
      if (!funded) throw new Error('Deposit confirmed, but private balance sync is still pending.')

      setShowFundModal(false)
      await executePaymentFlow()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Fund & Pay failed', 'error')
    } finally {
      setBusy(false)
      setTxStatusText(null)
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return
    try {
      const pdf = buildInvoicePdf({
        invoiceId: invoice.invoiceId,
        issueDate: formatIssueDate(invoice.createdAt),
        issuerAddress: invoice.issuerAddress,
        issuerInfo: invoice.issuerInfo,
        payerAddress: invoice.payerAddress,
        payerInfo: invoice.payerInfo,
        title: invoice.title,
        description: invoice.description,
        amount: invoice.amount,
        tokenSymbol: invoice.tokenSymbol,
        statusText: 'SENT',
      })
      const blob = pdf.output('blob')
      const regeneratedHash = await sha256Blob(blob)
      if (regeneratedHash !== invoice.pdfHash) {
        toast.show('Warning: regenerated PDF hash differs from stored hash.', 'error')
      }
      downloadPdf(blob, `${invoice.invoiceId}.pdf`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed to generate PDF', 'error')
    }
  }

  if (loading) {
    return <main className="px-8 py-10 max-w-4xl text-nyx-muted text-sm">Loading invoice...</main>
  }

  if (error || !invoice) {
    return (
      <main className="px-8 py-10 max-w-4xl">
        <div className="nyx-card p-6 border-nyx-danger/20 text-nyx-danger text-sm">
          {error ?? 'Invoice not found'}
        </div>
      </main>
    )
  }

  return (
    <main className="px-8 py-10 max-w-4xl space-y-4">
      <button
        onClick={() => navigate('/invoices')}
        className="btn-ghost text-nyx-muted text-sm hover:text-nyx-text inline-flex items-center gap-1.5"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back
      </button>

      <div className="nyx-card p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] tracking-widest uppercase text-nyx-muted mb-1">Invoice ID</p>
            <h1 className="text-xl font-semibold text-nyx-text">{invoice.invoiceId}</h1>
            <p className="text-nyx-muted text-xs mt-1">{new Date(invoice.createdAt).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[rgba(108,92,231,0.12)] text-nyx-accent">
              {invoice.status}
            </span>
            <p className="text-nyx-text font-semibold mt-3">{fmtMoney(invoice.amount, invoice.tokenSymbol)}</p>
            <p className="text-nyx-muted text-xs mt-1 font-mono">{shortAddress(invoice.tokenAddress)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Issuer</p>
            <p className="text-nyx-text text-sm">{fmtPartyName(invoice.issuerInfo)}</p>
            <p className="font-mono text-nyx-muted text-xs mt-1 break-all">{invoice.issuerAddress}</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Payer</p>
            <p className="text-nyx-text text-sm">{fmtPartyName(invoice.payerInfo)}</p>
            <p className="font-mono text-nyx-muted text-xs mt-1 break-all">{invoice.payerAddress}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Title</p>
            <p className="text-nyx-text text-sm">{invoice.title}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Description</p>
            <p className="text-nyx-text text-sm leading-relaxed">{invoice.description}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Token</p>
            <p className="text-nyx-text text-sm">{invoice.tokenSymbol}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">PDF Hash</p>
            <p className="font-mono text-nyx-muted text-xs break-all">{invoice.pdfHash}</p>
          </div>
          {invoice.rejectionReason && (
            <div className="bg-[rgba(239,68,68,0.08)] border border-nyx-danger/30 rounded-lg p-3">
              <p className="text-nyx-danger text-xs font-medium mb-1">Rejection Reason</p>
              <p className="text-nyx-muted text-sm">{invoice.rejectionReason}</p>
            </div>
          )}
        </div>

        <button onClick={handleDownloadPdf} disabled={busy} className="btn-secondary mt-5">
          <Download size={13} strokeWidth={1.5} />
          Download PDF
        </button>
      </div>

      {txStatusText && (
        <div className="nyx-card p-4 flex items-center gap-2 text-nyx-muted text-sm">
          <Loader2 size={14} className="animate-spin text-nyx-accent" />
          {txStatusText}
        </div>
      )}

      {isPayer && (
        <div className="nyx-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-4">Actions</p>

          {invoice.status === 'sent' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={handleAccept} disabled={busy} className="btn-secondary">
                <Check size={13} strokeWidth={1.5} />
                {busy ? 'Processing...' : 'Accept'}
              </button>
              <button onClick={() => setShowReject((v) => !v)} disabled={busy} className="btn-danger">
                <X size={13} strokeWidth={1.5} />
                Reject
              </button>
              <button onClick={handlePay} disabled={busy} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>
                <CircleDollarSign size={13} strokeWidth={1.5} className="inline mr-1.5" />
                {busy ? 'Processing...' : 'Pay'}
              </button>
            </div>
          )}

          {invoice.status === 'accepted' && (
            <button onClick={handlePay} disabled={busy} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>
              <CircleDollarSign size={13} strokeWidth={1.5} className="inline mr-1.5" />
              {busy ? 'Processing...' : 'Pay'}
            </button>
          )}

          {invoice.status === 'paid' && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[rgba(34,197,94,0.12)] text-nyx-success">
              Paid
            </span>
          )}

          {showReject && (
            <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)] space-y-3">
              <label className="text-xs text-nyx-muted block">Rejection reason</label>
              <textarea
                className="w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150 resize-none"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
              />
              <button onClick={handleReject} disabled={busy || !rejectReason.trim()} className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Saving...' : 'Confirm Reject'}
              </button>
            </div>
          )}
        </div>
      )}

      {isIssuer && (
        <div className="nyx-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Issuer View</p>
          <p className="text-nyx-muted text-sm">
            Counterparty: <span className="text-nyx-text">{shortAddress(invoice.payerAddress)}</span>
          </p>
          <p className="text-nyx-muted text-sm mt-1">
            Status: <span className="text-nyx-text uppercase">{invoice.status}</span>
          </p>
        </div>
      )}

      {showFundModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="nyx-card p-6 w-full max-w-md">
            <p className="text-xl font-semibold text-nyx-text mb-2">Insufficient private balance</p>
            <p className="text-nyx-muted text-sm mb-4">
              You need {fmtMoney(invoice.amount, invoice.tokenSymbol)} in private {invoice.tokenSymbol} to pay this invoice.
            </p>
            <p className="text-nyx-muted text-xs mb-4">
              Current private balance: {Number(privateTokenBalance) / 10 ** tokenDecimals}
            </p>

            {!publicAddress ? (
              <button onClick={connectPublicWallet} disabled={busy} className="btn-secondary w-full justify-center">
                Connect Public Wallet
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-nyx-muted text-xs">Connected: <span className="font-mono">{shortAddress(publicAddress)}</span></p>
                <button onClick={fundAndPay} disabled={busy} className="btn-primary">
                  {busy ? 'Processing...' : 'Fund & Pay'}
                </button>
              </div>
            )}

            <button
              onClick={() => setShowFundModal(false)}
              disabled={busy}
              className="btn-ghost text-nyx-muted text-sm hover:text-nyx-text mt-3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
