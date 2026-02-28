import { useEffect, useState } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useNavigate } from 'react-router-dom'
import { FilePlus, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react'

interface Invoice {
  _id: string
  issuerAddress: string
  issuerFirstName?: string
  issuerLastName?: string
  issuerCompany?: string
  payerAddress: string
  payerFirstName?: string
  payerLastName?: string
  payerCompany?: string
  title: string
  description: string
  amount: number
  currency: string
  status: 'draft' | 'sent' | 'paid'
  createdAt: string
}

const STATUS_STYLES: Record<Invoice['status'], string> = {
  draft: 'bg-[rgba(140,148,179,0.12)] text-nyx-muted',
  sent:  'bg-[rgba(108,92,231,0.12)] text-nyx-accent',
  paid:  'bg-[rgba(34,197,94,0.12)]  text-nyx-success',
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function counterpartyLabel(inv: Invoice, address: string) {
  if (inv.issuerAddress === address) {
    const name = [inv.payerFirstName, inv.payerLastName].filter(Boolean).join(' ')
    return name || inv.payerCompany || inv.payerAddress.slice(0, 14) + '…'
  }
  const name = [inv.issuerFirstName, inv.issuerLastName].filter(Boolean).join(' ')
  return name || inv.issuerCompany || inv.issuerAddress.slice(0, 14) + '…'
}

export default function InvoiceDashboard() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const address = activeAccount?.address ?? ''

  async function load() {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts?address=${encodeURIComponent(address)}`)
      if (!res.ok) throw new Error('Failed to load invoices')
      setInvoices(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [address])

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">Invoices</h1>
          <p className="text-nyx-muted text-sm mt-0.5">Sent and received invoices for your address.</p>
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
        <div className="text-nyx-muted text-sm py-16 text-center">Loading invoices...</div>
      )}

      {error && (
        <div className="nyx-card p-6 border-nyx-danger/20 text-nyx-danger text-sm">
          {error}
        </div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="nyx-card p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[rgba(108,92,231,0.08)] border border-[rgba(108,92,231,0.15)] flex items-center justify-center mx-auto mb-4">
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
              <div key={inv._id} className="nyx-card p-5 flex items-center justify-between gap-4">
                {/* Role icon */}
                <div className={[
                  'w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center',
                  isSent
                    ? 'bg-[rgba(108,92,231,0.1)]'
                    : 'bg-[rgba(34,197,94,0.08)]',
                ].join(' ')}>
                  {isSent
                    ? <ArrowUpRight size={15} className="text-nyx-accent" strokeWidth={1.5} />
                    : <ArrowDownLeft size={15} className="text-nyx-success" strokeWidth={1.5} />
                  }
                </div>

                {/* Title + counterparty */}
                <div className="flex-1 min-w-0">
                  <p className="text-nyx-text text-sm font-medium truncate">{inv.title}</p>
                  <p className="text-nyx-muted text-xs mt-0.5 truncate">
                    {isSent ? 'To: ' : 'From: '}{counterpartyLabel(inv, address)}
                  </p>
                </div>

                {/* Date */}
                <p className="text-nyx-muted text-xs flex-shrink-0 hidden sm:block">
                  {formatDate(inv.createdAt)}
                </p>

                {/* Role badge */}
                <span className={[
                  'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0',
                  isSent
                    ? 'bg-[rgba(108,92,231,0.1)] text-nyx-accent'
                    : 'bg-[rgba(34,197,94,0.08)] text-nyx-success',
                ].join(' ')}>
                  {isSent ? 'Sent' : 'Received'}
                </span>

                {/* Status badge */}
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0 ${STATUS_STYLES[inv.status]}`}>
                  {inv.status}
                </span>

                {/* Amount */}
                <p className="text-nyx-text text-sm font-semibold flex-shrink-0 tabular-nums">
                  {formatAmount(inv.amount, inv.currency)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
