import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseAmount, useUnlink } from '@unlink-xyz/react'
import { ArrowLeft, Check, Download, Loader2, X } from 'lucide-react'
import { toast } from '../../lib/toast'
import type { Invoice } from '../../lib/invoices'
import {
  applyInvoiceLocalOverride,
  formatDueDate,
  formatIssueDate,
  invoiceStatusLabel,
  normalizeInvoiceRecord,
  setInvoiceLocalOverride,
  subscribeInvoiceUpdates,
} from '../../lib/invoices'
import { buildInvoicePdf, downloadPdf, sha256Blob } from '../../lib/invoicePdf'
import { getTokenByAddress } from '../../lib/tokens'

function fmtMoney(amount: number, symbol: string) {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`
}

function shortAddress(address: string) {
  if (address.length < 16) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeAccount, send, waitForConfirmation, refresh, balances } = useUnlink()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [insufficientFunds, setInsufficientFunds] = useState(false)
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
  const requiredAmount = useMemo(() => {
    if (!invoice) return 0n
    return parseAmount(String(invoice.amount), tokenDecimals)
  }, [invoice, tokenDecimals])

  const loadInvoice = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      // Prefer list-by-address first for compatibility with older API versions.
      if (address) {
        const listRes = await fetch(`/api/contracts?address=${encodeURIComponent(address)}&ts=${Date.now()}`, {
          cache: 'no-store',
        })
        if (listRes.ok) {
          const listRaw = await listRes.json() as Record<string, unknown>[]
          const list = listRaw.map((item) => applyInvoiceLocalOverride(normalizeInvoiceRecord(item)))
          const match = list.find((inv) => inv._id === id || inv.invoiceId === id)
          if (match) {
            setInvoice(match)
            return
          }
        }
      }

      // Fallback to direct by-id endpoint (new API).
      const res = await fetch(`/api/contracts/${id}?ts=${Date.now()}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        setInvoice(applyInvoiceLocalOverride(normalizeInvoiceRecord(data)))
        return
      }

      throw new Error('Failed to load invoice')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id, address])

  useEffect(() => { void loadInvoice() }, [loadInvoice])

  useEffect(() => {
    if (!id) return
    const timer = window.setInterval(() => {
      if (!busy) void loadInvoice()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [id, busy, loadInvoice])

  useEffect(() => subscribeInvoiceUpdates(() => { if (!busy) void loadInvoice() }), [busy, loadInvoice])

  async function patchInvoice(patch: Record<string, unknown>) {
    if (!id) throw new Error('Missing invoice id')

    const tryPatch = async (targetId: string) => fetch(`/api/contracts/${targetId}?ts=${Date.now()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(patch),
    })

    const tryPostUpdate = async (targetId: string) => fetch(`/api/contracts/${targetId}/update?ts=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(patch),
    })

    const tryPostGenericUpdate = async (targetId: string) => fetch(`/api/contracts/update?ts=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ id: targetId, ...patch }),
    })

    let res = await tryPatch(id)

    if (!res.ok && invoice?.invoiceId && invoice.invoiceId !== id) {
      res = await tryPatch(invoice.invoiceId)
    }

    if (!res.ok) {
      // Compatibility: some environments block PATCH but allow POST.
      res = await tryPostUpdate(id)
      if (!res.ok && invoice?.invoiceId && invoice.invoiceId !== id) {
        res = await tryPostUpdate(invoice.invoiceId)
      }
    }

    if (!res.ok) {
      // Compatibility: generic update endpoint.
      res = await tryPostGenericUpdate(id)
      if (!res.ok && invoice?.invoiceId && invoice.invoiceId !== id) {
        res = await tryPostGenericUpdate(invoice.invoiceId)
      }
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to update invoice')
    }

    const data = await res.json() as { invoice?: Record<string, unknown> }
    if (data.invoice) {
      const normalized = normalizeInvoiceRecord(data.invoice)
      setInvoice(normalized)
      setInvoiceLocalOverride(
        normalized._id,
        normalized.invoiceId,
        patch as Partial<Pick<Invoice, 'status' | 'payment' | 'rejectionReason'>>
      )
    } else {
      await loadInvoice()
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

  async function handleAccept() {
    // Accept in this flow means "accept and pay now".
    await handlePay()
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
    const paidPayment: Invoice['payment'] = {
      relayId: result.relayId,
      txHash: status.txHash,
      paidAt: new Date().toISOString(),
    }
    await patchInvoice({
      status: 'paid',
      rejectionReason: null,
      payment: paidPayment,
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
      setInsufficientFunds(false)
      const localBalance = balancesRef.current[tokenAddress] ?? 0n
      if (localBalance < requiredAmount) {
        setInsufficientFunds(true)
        toast.show('Insufficient private balance.', 'error')
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

  async function handleDownloadPdf() {
    if (!invoice) return
    try {
      const pdf = await buildInvoicePdf({
        invoiceId: invoice.invoiceId,
        issueDate: formatIssueDate(invoice.createdAt),
        dueDate: formatDueDate(invoice.createdAt, invoice.dueDate),
        issuerAddress: invoice.issuerAddress,
        issuerInfo: invoice.issuerInfo,
        payerAddress: invoice.payerAddress,
        payerInfo: invoice.payerInfo,
        lineItems: invoice.lineItems,
        tokenSymbol: invoice.tokenSymbol,
        status: invoice.status,
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

  const statusView: Record<Invoice['status'], { cls: string }> = {
    sent: { cls: 'bg-[rgba(234,179,8,0.16)] text-yellow-300' },
    accepted: { cls: 'bg-[rgba(234,179,8,0.16)] text-yellow-300' },
    rejected: { cls: 'bg-[rgba(239,68,68,0.14)] text-nyx-danger' },
    paid: { cls: 'bg-[rgba(34,197,94,0.12)] text-nyx-success' },
  }
  const currentStatus = statusView[invoice.status]
  const currentStatusLabel = invoiceStatusLabel(invoice.status)
  const issuerName = [invoice.issuerInfo?.firstName, invoice.issuerInfo?.lastName].filter(Boolean).join(' ').trim() || '—'
  const payerName = [invoice.payerInfo?.firstName, invoice.payerInfo?.lastName].filter(Boolean).join(' ').trim() || '—'

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
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md ${currentStatus.cls}`}>
              {currentStatusLabel}
            </span>
            <p className="text-nyx-text font-semibold mt-3">{fmtMoney(invoice.amount, invoice.tokenSymbol)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Issuer</p>
            <p className="text-nyx-text text-sm">{issuerName}</p>
            {invoice.issuerInfo?.company && (
              <p className="text-nyx-muted text-xs mt-0.5">{invoice.issuerInfo.company}</p>
            )}
            <p className="font-mono text-nyx-muted text-xs mt-1 break-all">{invoice.issuerAddress}</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Payer</p>
            <p className="text-nyx-text text-sm">{payerName}</p>
            {invoice.payerInfo?.company && (
              <p className="text-nyx-muted text-xs mt-0.5">{invoice.payerInfo.company}</p>
            )}
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
          {invoice.status === 'paid' && (invoice.payment?.txHash || invoice.payment?.relayId) && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Payment Proof</p>
              <div className="space-y-1">
                {invoice.payment?.txHash && (
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${invoice.payment.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-nyx-success text-sm underline break-all"
                  >
                    {invoice.payment.txHash}
                  </a>
                )}
                {invoice.payment?.relayId && (
                  <p className="font-mono text-nyx-muted text-xs break-all">
                    Relay ID: {invoice.payment.relayId}
                  </p>
                )}
              </div>
            </div>
          )}
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

      {isPayer && invoice.status !== 'rejected' && invoice.status !== 'paid' && (
        <div className="nyx-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-4">Actions</p>

          {invoice.status === 'sent' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={handleAccept} disabled={busy} className="btn-secondary">
                <Check size={13} strokeWidth={1.5} />
                {busy ? 'Processing...' : 'Accept & Pay'}
              </button>
              <button onClick={() => setShowReject((v) => !v)} disabled={busy} className="btn-danger">
                <X size={13} strokeWidth={1.5} />
                Reject
              </button>
            </div>
          )}

          {invoice.status === 'accepted' && (
            <button onClick={handlePay} disabled={busy} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>
              {busy ? 'Processing...' : 'Accept & Pay'}
            </button>
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

      {insufficientFunds && (
        <div className="nyx-card p-6 border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.06)]">
          <p className="text-yellow-300 text-sm font-medium mb-2">Insufficient private balance</p>
          <p className="text-nyx-muted text-sm mb-4">
            This invoice needs {fmtMoney(invoice.amount, invoice.tokenSymbol)} but your private balance is lower.
          </p>
          <div className="flex gap-2">
            <button onClick={() => navigate('/wallet')} className="btn-secondary">
              Go To Wallet
            </button>
            <button onClick={() => navigate('/profile')} className="btn-secondary">
              Go To Profile
            </button>
          </div>
        </div>
      )}

      {isIssuer && (
        <div className="nyx-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Issuer View</p>
          <p className="text-nyx-muted text-sm">
            Counterparty: <span className="text-nyx-text">{shortAddress(invoice.payerAddress)}</span>
          </p>
          <p className="text-nyx-muted text-sm mt-1">
            Status: <span className="text-nyx-text uppercase">{currentStatusLabel}</span>
          </p>
        </div>
      )}

    </main>
  )
}
