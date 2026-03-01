import { useEffect, useState } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useNavigate } from 'react-router-dom'
import { FilePlus, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2 } from 'lucide-react'
import type { Invoice } from '../../lib/invoices'
import {
  applyInvoiceLocalOverride,
  fmtPartyName,
  invoiceStatusLabel,
  normalizeInvoiceRecord,
  subscribeInvoiceUpdates,
} from '../../lib/invoices'

const STATUS_STYLES: Record<Invoice['status'], string> = {
  sent: 'bg-[#FDE68A] text-[#78350F]',
  accepted: 'bg-[#FDE68A] text-[#78350F]',
  rejected: 'bg-[#F87171] text-[#7F1D1D]',
  paid: 'bg-[#22C55E] text-[#052E16]',
}

const STATUS_LABELS: Record<Invoice['status'], string> = {
  sent: invoiceStatusLabel('sent'),
  accepted: invoiceStatusLabel('accepted'),
  rejected: invoiceStatusLabel('rejected'),
  paid: invoiceStatusLabel('paid'),
}

function formatAmount(amount: number, symbol: string, isSent: boolean) {
  const sign = isSent ? '+' : '-'
  const normalized = symbol.startsWith('$') ? symbol : `$${symbol}`
  return `${sign} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${normalized}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function counterpartyLabel(inv: Invoice, address: string) {
  if (inv.issuerAddress === address) {
    return fmtPartyName(inv.payerInfo) !== '—'
      ? fmtPartyName(inv.payerInfo)
      : inv.payerAddress.slice(0, 14) + '…'
  }
  return fmtPartyName(inv.issuerInfo) !== '—'
    ? fmtPartyName(inv.issuerInfo)
    : inv.issuerAddress.slice(0, 14) + '…'
}

export default function InvoiceDashboard() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingDots, setLoadingDots] = useState(1)

  const address = activeAccount?.address ?? ''

  async function load() {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts?address=${encodeURIComponent(address)}&ts=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load invoices')
      const raw = await res.json() as Record<string, unknown>[]
      setInvoices(raw.map((item) => applyInvoiceLocalOverride(normalizeInvoiceRecord(item))))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [address])

  useEffect(() => {
    if (!address) return
    const timer = window.setInterval(() => {
      void load()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [address])

  useEffect(() => subscribeInvoiceUpdates(() => { void load() }), [address])

  useEffect(() => {
    if (!loading) return
    const timer = window.setInterval(() => {
      setLoadingDots((prev) => (prev % 3) + 1)
    }, 450)
    return () => window.clearInterval(timer)
  }, [loading])

  return (
    <main className="px-8 py-10 max-w-4xl mx-auto w-full md:ml-[280px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">Invoices</h1>
          <p className="text-nyx-muted text-sm mt-0.5">Track your sent invoices and their current status.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="btn-secondary"
            disabled={loading}
          >
            <RefreshCw size={13} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => navigate('/invoices/create')} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>
            <FilePlus size={13} strokeWidth={1.5} className="inline mr-1.5" />
            New Invoice
          </button>
        </div>
      </div>

      {loading && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="flex items-center gap-2 text-nyx-muted text-sm">
            <Loader2 size={16} className="animate-spin text-nyx-accent" />
            {`Loading Invoices${'.'.repeat(loadingDots)}`}
          </div>
        </div>
      )}

      {error && (
        <div className="nyx-card p-6 border-nyx-danger/20 text-nyx-danger text-sm">
          {error}
        </div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="nyx-card p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-nyx-active border border-[rgba(108,92,231,0.15)] flex items-center justify-center mx-auto mb-4">
            <FilePlus size={22} className="text-nyx-accent" strokeWidth={1.5} />
          </div>
          <p className="text-nyx-text font-medium mb-1">No invoices yet.</p>
          <p className="text-nyx-muted text-sm mb-6">Create your first invoice to get started.</p>
          <button
            onClick={() => navigate('/invoices/create')}
            className="btn-primary"
            style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}
          >
            <FilePlus size={13} strokeWidth={1.5} />
            Create Invoice
          </button>
        </div>
      )}

      {!loading && !error && invoices.length > 0 && (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const isSent = inv.issuerAddress === address
            return (
              <button
                key={inv._id}
                onClick={() => navigate(`/invoices/${inv._id || inv.invoiceId}`)}
                className="nyx-card p-5 flex items-center justify-between gap-4 w-full text-left"
              >
                {/* Role icon */}
                <div className={[
                  'w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center',
                  isSent
                    ? 'bg-nyx-active'
                    : 'bg-[rgba(34,197,94,0.08)]',
                ].join(' ')}>
                  {isSent
                    ? <ArrowUpRight size={15} className="text-nyx-accent" strokeWidth={1.5} />
                    : <ArrowDownLeft size={15} className="text-nyx-success" strokeWidth={1.5} />
                  }
                </div>

                {/* Title + counterparty */}
                <div className="flex-1 min-w-0">
                  <p className="text-nyx-muted text-[10px] uppercase tracking-wider mb-0.5">{inv.invoiceId}</p>
                  <p className="text-nyx-text text-sm font-medium truncate">{inv.title}</p>
                  <p className="text-nyx-muted text-xs mt-0.5 truncate">
                    {isSent ? 'To: ' : 'From: '}{counterpartyLabel(inv, address)}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 flex-shrink-0 min-w-[220px] sm:min-w-[290px]">
                  {/* Date */}
                  <p className="text-nyx-muted text-xs tabular-nums w-[88px] text-right hidden sm:block">
                    {formatDate(inv.createdAt)}
                  </p>

                  {/* Status badge */}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md inline-flex items-center justify-center w-[74px] flex-shrink-0 ${STATUS_STYLES[inv.status]}`}>
                    {STATUS_LABELS[inv.status]}
                  </span>

                  {/* Amount */}
                  <p className="text-nyx-text text-sm font-semibold tabular-nums w-[110px] text-right flex-shrink-0">
                    {formatAmount(inv.amount, inv.tokenSymbol ?? inv.currencySymbol ?? 'TOKEN', isSent)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
