import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseAmount, useUnlink, useUnlinkHistory } from '@unlink-xyz/react'
import { ArrowLeft, Check, Download, ExternalLink, Link2, Loader2, QrCode, X } from 'lucide-react'
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
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $${symbol}`
}

function payPath(invoice: Invoice): string {
  return `/pay/${encodeURIComponent(invoice.invoiceId || invoice._id)}`
}

function payUrl(invoice: Invoice): string {
  const path = payPath(invoice)
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

function payQrUrl(invoice: Invoice): string {
  const url = encodeURIComponent(payUrl(invoice))
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${url}`
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeAccount, send, waitForConfirmation, refresh, balances, notes } = useUnlink()

  const { history } = useUnlinkHistory()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDots, setLoadingDots] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [txStatusText, setTxStatusText] = useState<string | null>(null)
  const [copiedIssuer, setCopiedIssuer] = useState(false)
  const [copiedPayer, setCopiedPayer] = useState(false)
  const [copiedPayLink, setCopiedPayLink] = useState(false)
  const [showProofDetails, setShowProofDetails] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  function copyAddress(addr: string, which: 'issuer' | 'payer') {
    navigator.clipboard.writeText(addr).then(() => {
      if (which === 'issuer') {
        setCopiedIssuer(true)
        setTimeout(() => setCopiedIssuer(false), 1500)
      } else {
        setCopiedPayer(true)
        setTimeout(() => setCopiedPayer(false), 1500)
      }
    })
  }

  const balancesRef = useRef(balances)
  useEffect(() => { balancesRef.current = balances }, [balances])

  const address = activeAccount?.address ?? ''
  const isPayer = !!invoice && invoice.payerAddress === address
  const isIssuer = !!invoice && invoice.issuerAddress === address

  // Match the ZK history entry and notes by the on-chain txHash
  const paymentTxHash = invoice?.payment?.txHash
  const proofEntry  = paymentTxHash ? history.find((e) => e.txHash === paymentTxHash) : undefined
  const spentNotes  = paymentTxHash ? notes.filter((n) => n.spentTxHash   === paymentTxHash) : []
  const createdNotes = paymentTxHash ? notes.filter((n) => n.createdTxHash === paymentTxHash) : []

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
    }, 30000)
    return () => window.clearInterval(timer)
  }, [id, busy, loadInvoice])

  useEffect(() => subscribeInvoiceUpdates(() => { if (!busy) void loadInvoice() }), [busy, loadInvoice])

  useEffect(() => {
    if (!loading) return
    const timer = window.setInterval(() => {
      setLoadingDots((prev) => (prev % 3) + 1)
    }, 450)
    return () => window.clearInterval(timer)
  }, [loading])

  useEffect(() => {
    if (!loading) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [loading])

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
      const localBalance = balancesRef.current[tokenAddress] ?? 0n
      if (localBalance < requiredAmount) {
        toast.show('Insufficient private balance.', 'error')
        navigate('/wallet')
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
        payment: invoice.payment,
        nullifiers: spentNotes.map((n) => n.nullifier),
      })
      const blob = pdf.output('blob')
      const regeneratedHash = await sha256Blob(blob)
      if (regeneratedHash !== invoice.pdfHash) {
        try {
          await patchInvoice({ pdfHash: regeneratedHash })
        } catch {
          // ignore hash sync errors during download
        }
      }
      downloadPdf(blob, `NYX-Invoice-${invoice.invoiceId}.pdf`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed to generate PDF', 'error')
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 text-nyx-muted text-sm">
          <Loader2 size={16} className="animate-spin text-nyx-accent" />
          {`Loading Invoice${'.'.repeat(loadingDots)}`}
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <main className="px-8 py-10 w-full flex justify-center">
        <div className="w-full max-w-3xl">
          <div className="nyx-card p-6 border-nyx-danger/20 text-nyx-danger text-sm">
            {error ?? 'Invoice not found'}
          </div>
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
    <main className="px-8 py-10 w-full">
      <div className="w-full max-w-3xl mx-auto md:-translate-x-20 space-y-4">
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
          <div className="bg-nyx-hover border border-nyx-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Issuer</p>
            <p className="text-nyx-text text-sm">{issuerName}</p>
            {invoice.issuerInfo?.company && (
              <p className="text-nyx-muted text-xs mt-0.5">{invoice.issuerInfo.company}</p>
            )}
            <div className="relative group cursor-pointer mt-1" onClick={() => copyAddress(invoice.issuerAddress, 'issuer')}>
              <p className={`font-mono text-xs break-all transition-colors duration-150 select-none ${copiedIssuer ? 'text-nyx-success' : 'text-nyx-muted group-hover:text-nyx-accent'}`}>
                {copiedIssuer ? 'Copied!' : invoice.issuerAddress}
              </p>
              {!copiedIssuer && (
                <span className="absolute -top-6 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-nyx-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
                  Click to copy
                </span>
              )}
            </div>
          </div>
          <div className="bg-nyx-hover border border-nyx-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-2">Payer</p>
            <p className="text-nyx-text text-sm">{payerName}</p>
            {invoice.payerInfo?.company && (
              <p className="text-nyx-muted text-xs mt-0.5">{invoice.payerInfo.company}</p>
            )}
            <div className="relative group cursor-pointer mt-1" onClick={() => copyAddress(invoice.payerAddress, 'payer')}>
              <p className={`font-mono text-xs break-all transition-colors duration-150 select-none ${copiedPayer ? 'text-nyx-success' : 'text-nyx-muted group-hover:text-nyx-accent'}`}>
                {copiedPayer ? 'Copied!' : invoice.payerAddress}
              </p>
              {!copiedPayer && (
                <span className="absolute -top-6 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-nyx-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
                  Click to copy
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-3">Services</p>
            <div className="space-y-2">
              {invoice.lineItems.map((item, i) => (
                <div key={i} className="bg-nyx-hover border border-nyx-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-nyx-text text-sm font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-nyx-muted text-xs mt-0.5 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                    <p className="text-nyx-text text-sm font-mono whitespace-nowrap flex-shrink-0">{fmtMoney(item.amount, invoice.tokenSymbol)}</p>
                  </div>
                </div>
              ))}
              {invoice.lineItems.length > 1 && (
                <div className="flex justify-between items-center pt-2 border-t border-nyx-border">
                  <p className="text-[10px] uppercase tracking-widest text-nyx-muted">Total</p>
                  <p className="text-nyx-text text-sm font-semibold">{fmtMoney(invoice.amount, invoice.tokenSymbol)}</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Token</p>
            <p className="text-nyx-text text-sm">${invoice.tokenSymbol}</p>
          </div>
          {isIssuer && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Pay Link</p>
              <div className="rounded-lg border border-[rgba(108,92,231,0.28)] bg-[rgba(108,92,231,0.10)] p-3 space-y-2">
                <p className="text-xs text-nyx-text">
                  Send this payment link to the payer:
                </p>
                <a
                  href={payPath(invoice)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nyx-accent text-xs underline break-all"
                >
                  {payUrl(invoice)}
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-nyx-muted text-xs hover:text-nyx-text inline-flex items-center gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(payUrl(invoice)).then(() => {
                        setCopiedPayLink(true)
                        setTimeout(() => setCopiedPayLink(false), 1500)
                      }).catch(() => {})
                    }}
                  >
                    <Link2 size={12} />
                    {copiedPayLink ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs inline-flex items-center gap-1.5"
                    onClick={() => setShowQrModal(true)}
                  >
                    <QrCode size={12} />
                    Generate QR Code
                  </button>
                </div>
              </div>
            </div>
          )}
          {invoice.status === 'paid' && (invoice.payment?.txHash || invoice.payment?.relayId) && (
            <div className="bg-[rgba(34,197,94,0.05)] border border-[rgba(34,197,94,0.15)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-widest text-nyx-success font-semibold">Payment Proof</p>
                <button
                  type="button"
                  className="btn-ghost text-xs text-nyx-muted hover:text-nyx-text"
                  onClick={() => setShowProofDetails((prev) => !prev)}
                >
                  {showProofDetails ? 'Hide details' : 'See details'}
                </button>
              </div>

              {invoice.payment?.txHash && (
                <a
                  href={`https://testnet.monadexplorer.com/tx/${invoice.payment.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nyx-success text-xs inline-flex items-center gap-1.5 underline"
                >
                  <ExternalLink size={12} />
                  Open in Explorer
                </a>
              )}

              {showProofDetails && (
                <div className="space-y-3 pt-1">
                  {invoice.payment?.paidAt && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-0.5">Paid At</p>
                      <p className="text-nyx-text text-xs">{new Date(invoice.payment.paidAt).toLocaleString()}</p>
                    </div>
                  )}

                  {invoice.payment?.txHash && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-0.5">Transaction Hash</p>
                      <p className="font-mono text-nyx-success text-xs break-all">{invoice.payment.txHash}</p>
                    </div>
                  )}

                  {invoice.payment?.relayId && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-0.5">Relay ID</p>
                      <p className="font-mono text-nyx-muted text-xs break-all">{invoice.payment.relayId}</p>
                    </div>
                  )}

                  {proofEntry && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">ZK Transfer Record</p>
                      <div className="bg-nyx-hover rounded-md p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-nyx-text font-medium">{proofEntry.kind}</span>
                          <span className={`ml-auto text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${proofEntry.status === 'confirmed' ? 'bg-[rgba(34,197,94,0.12)] text-nyx-success' : 'bg-nyx-hover text-nyx-muted'}`}>
                            {proofEntry.status}
                          </span>
                        </div>
                        {proofEntry.timestamp && (
                          <p className="text-nyx-muted text-xs">{new Date(proofEntry.timestamp).toLocaleString()}</p>
                        )}
                        {proofEntry.amounts.map(({ token, delta }) => (
                          <div key={token} className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-nyx-muted truncate">{token.slice(0, 10)}…</span>
                            <span className={delta.startsWith('-') ? 'text-nyx-danger' : 'text-nyx-success'}>{delta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(spentNotes.length > 0 || createdNotes.length > 0) && (
                    <div className="pt-2 border-t border-nyx-border">
                      <p className="text-[10px] text-nyx-muted leading-relaxed mb-3">
                        Nullifiers and commitments are ZK cryptographic values embedded in the pool contract calldata.
                        They cannot be searched directly - verify them by inspecting the transaction above.
                      </p>

                      {spentNotes.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Nullified Notes ({spentNotes.length})</p>
                          <div className="space-y-1.5">
                            {spentNotes.map((n) => (
                              <div key={n.nullifier} className="bg-nyx-hover rounded-md p-2.5 space-y-1 font-mono text-[10px]">
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">nullifier</span>
                                  <span className="text-nyx-text break-all">{n.nullifier}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">commitment</span>
                                  <span className="text-nyx-muted break-all">{n.commitment}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">value</span>
                                  <span className="text-nyx-text">{n.value.toString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {createdNotes.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Output Notes ({createdNotes.length})</p>
                          <div className="space-y-1.5">
                            {createdNotes.map((n) => (
                              <div key={n.commitment} className="bg-nyx-hover rounded-md p-2.5 space-y-1 font-mono text-[10px]">
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">commitment</span>
                                  <span className="text-nyx-text break-all">{n.commitment}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">value</span>
                                  <span className="text-nyx-text">{n.value.toString()}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-nyx-muted w-20 flex-shrink-0">leaf index</span>
                                  <span className="text-nyx-muted">{n.index}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
          Download Invoice
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
              <button
                onClick={handleAccept}
                disabled={busy}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={13} strokeWidth={1.5} />
                {busy ? 'Processing...' : 'Accept & Pay'}
              </button>
              <button
                onClick={() => setShowReject((v) => !v)}
                disabled={busy}
                className="btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={13} strokeWidth={1.5} />
                Reject
              </button>
            </div>
          )}

          {invoice.status === 'accepted' && (
            <button
              onClick={handlePay}
              disabled={busy}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              {busy ? 'Processing...' : 'Accept & Pay'}
            </button>
          )}
          {showReject && (
            <div className="mt-4 pt-4 border-t border-nyx-border space-y-3">
              <label className="text-xs text-nyx-muted block">Rejection reason</label>
              <textarea
                className="w-full w-full bg-nyx-bg border border-nyx-border rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150 resize-none"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                disabled={busy}
              />
              <button onClick={handleReject} disabled={busy || !rejectReason.trim()} className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Saving...' : 'Confirm Reject'}
              </button>
            </div>
          )}
          </div>
        )}
      </div>

      {isIssuer && (
        <div
          className={[
            'fixed inset-0 z-50 flex items-center justify-center px-4',
            'transition-opacity duration-220 ease-out',
            showQrModal
              ? 'opacity-100 bg-[rgba(2,6,23,0.75)] backdrop-blur-sm pointer-events-auto'
              : 'opacity-0 pointer-events-none',
          ].join(' ')}
          onClick={() => setShowQrModal(false)}
        >
          <div
            className={[
              'nyx-card w-full max-w-2xl p-6',
              'transition-transform duration-220 ease-out',
              showQrModal ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-1">Payment QR Code</p>
                <p className="text-sm text-nyx-text">Scan to open payment page</p>
              </div>
              <button
                type="button"
                className="btn-ghost text-nyx-muted hover:text-nyx-text p-1"
                onClick={() => setShowQrModal(false)}
                aria-label="Close QR code"
              >
                <X size={14} />
              </button>
            </div>
            <div className="rounded-lg border border-nyx-border bg-nyx-hover p-4 flex items-center justify-center">
              <img
                src={payQrUrl(invoice)}
                alt="Payment QR"
                className="h-[420px] w-[420px] max-w-full rounded-md"
              />
            </div>
            <a
              href={payPath(invoice)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-nyx-accent underline break-all"
            >
              <ExternalLink size={12} />
              {payUrl(invoice)}
            </a>
          </div>
        </div>
      )}

    </main>
  )
}
