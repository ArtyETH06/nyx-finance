import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseAmount, useUnlink } from '@unlink-xyz/react'
import { ArrowLeft, Check, CircleDollarSign, X } from 'lucide-react'
import { toast } from '../../lib/toast'
import type { Invoice } from '../../lib/invoices'
import { fmtPartyName } from '../../lib/invoices'
import { USDC } from '../../lib/tokens'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fmtMoney(amount: number, currency: string) {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function shortAddress(address: string) {
  if (address.length < 16) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    activeAccount,
    send,
    deposit,
    waitForConfirmation,
    refresh,
    balances,
  } = useUnlink()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showFundModal, setShowFundModal] = useState(false)
  const [publicAddress, setPublicAddress] = useState<string | null>(null)
  const [payRetryRequested, setPayRetryRequested] = useState(false)

  const balancesRef = useRef(balances)
  useEffect(() => { balancesRef.current = balances }, [balances])

  const address = activeAccount?.address ?? ''
  const isIssuer = !!invoice && invoice.issuerAddress === address
  const isPayer = !!invoice && invoice.payerAddress === address
  const usdcBalance = useMemo(() => balances[USDC.address] ?? 0n, [balances])
  const requiredAmount = useMemo(() => {
    if (!invoice) return 0n
    return parseAmount(String(invoice.amount), USDC.decimals)
  }, [invoice])

  const loadInvoice = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${id}`)
      if (!res.ok) throw new Error('Failed to load invoice')
      setInvoice(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id])

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
    try {
      await patchInvoice({ status: 'accepted', rejectionReason: null })
      toast.show('Invoice accepted.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Accept failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.show('Rejection reason is required.', 'error')
      return
    }
    setBusy(true)
    try {
      await patchInvoice({ status: 'rejected', rejectionReason: rejectReason.trim() })
      setShowReject(false)
      setRejectReason('')
      toast.show('Invoice rejected.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Reject failed', 'error')
    } finally {
      setBusy(false)
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

  async function waitForPrivateFunds(required: bigint): Promise<boolean> {
    const maxTries = 20
    for (let i = 0; i < maxTries; i += 1) {
      await refresh()
      if ((balancesRef.current[USDC.address] ?? 0n) >= required) return true
      await sleep(1500)
    }
    return false
  }

  async function fundAndPay() {
    if (!publicAddress || !invoice) return
    setBusy(true)
    try {
      const missing = requiredAmount > usdcBalance ? requiredAmount - usdcBalance : 0n
      if (missing <= 0n) {
        setShowFundModal(false)
        setPayRetryRequested(true)
        return
      }

      const depositResult = await deposit([{ token: USDC.address, amount: missing, depositor: publicAddress }]) as
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

      await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      })

      const funded = await waitForPrivateFunds(requiredAmount)
      if (!funded) {
        throw new Error('Deposit sent, but private balance has not synced yet. Please retry Pay.')
      }

      setShowFundModal(false)
      setPayRetryRequested(true)
      toast.show('Deposit confirmed in private balance. Retrying payment...')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Fund & Pay failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handlePay() {
    if (!invoice) return
    if (invoice.status === 'paid') return

    setBusy(true)
    try {
      const localBalance = balancesRef.current[USDC.address] ?? 0n
      if (localBalance < requiredAmount) {
        setShowFundModal(true)
        return
      }

      const result = await send([{
        token: USDC.address,
        recipient: invoice.issuerAddress,
        amount: requiredAmount,
      }])
      const status = await waitForConfirmation(result.relayId, { timeout: 120000 })

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
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Payment failed', 'error')
    } finally {
      setBusy(false)
      setPayRetryRequested(false)
    }
  }

  useEffect(() => {
    if (payRetryRequested && !busy) {
      void handlePay()
    }
  }, [payRetryRequested, busy])

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
            <p className="text-nyx-text font-semibold mt-3">{fmtMoney(invoice.amount, invoice.currency)}</p>
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
      </div>

      {isPayer && (
        <div className="nyx-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-nyx-muted mb-4">Actions</p>

          {invoice.status === 'sent' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={handleAccept} disabled={busy} className="btn-secondary">
                <Check size={13} strokeWidth={1.5} />
                {busy ? 'Processing...' : 'Accept'}
              </button>
              <button
                onClick={() => setShowReject((v) => !v)}
                disabled={busy}
                className="btn-danger"
              >
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
              You need {fmtMoney(invoice.amount, invoice.currency)} in private USDC to pay this invoice.
            </p>
            <p className="text-nyx-muted text-xs mb-4">
              Current private balance: {Number(usdcBalance) / 10 ** USDC.decimals}
            </p>

            {!publicAddress ? (
              <button onClick={connectPublicWallet} disabled={busy} className="btn-secondary w-full justify-center">
                Connect Public Wallet
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-nyx-muted text-xs">Connected: <span className="font-mono">{shortAddress(publicAddress)}</span></p>
                <button onClick={fundAndPay} disabled={busy} className="btn-primary">
                  {busy ? 'Funding...' : 'Fund & Pay'}
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
