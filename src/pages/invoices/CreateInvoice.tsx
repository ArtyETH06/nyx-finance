import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { loadProfile } from '../../lib/profile'
import { toast } from '../../lib/toast'
import { buildInvoicePdf, sha256Blob } from '../../lib/invoicePdf'
import { computeDueDateIso, formatDueDate, formatIssueDate, makeInvoiceId } from '../../lib/invoices'
import { INVOICE_TOKEN_OPTIONS, getInvoiceTokenBySymbol, type InvoiceTokenSymbol } from '../../lib/tokens'

interface LineItemForm {
  title: string
  description: string
  amount: string
}

interface FormState {
  invoiceTitle:    string
  issuerFirstName: string
  issuerLastName:  string
  issuerCompany:   string
  payerFirstName:  string
  payerLastName:   string
  payerCompany:    string
  lineItems:       LineItemForm[]
  tokenSymbol:     InvoiceTokenSymbol
}

const empty: FormState = {
  invoiceTitle:    'Smart Contract Development Agreement',
  issuerFirstName: '',
  issuerLastName:  '',
  issuerCompany:   '',
  payerFirstName:  'Alex',
  payerLastName:   'Rivera',
  payerCompany:    'NYX Labs',
  lineItems:       [
    { title: 'Smart Contract Development', description: 'Development of ERC-20 token contract and deployment on Monad testnet.', amount: '0.0314' },
    { title: 'Integration & QA', description: 'Wallet integration, payment flow checks, and final validation on testnet.', amount: '0.042' },
  ],
  tokenSymbol:     'MON',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase mb-4">
      {children}
    </p>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-nyx-muted">
        {label}
        {required && <span className="text-nyx-accent ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-nyx-bg border border-nyx-border rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150'

export default function CreateInvoice() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submittingDots, setSubmittingDots] = useState(1)

  // Pre-fill issuer from saved profile
  useEffect(() => {
    const address = activeAccount?.address
    if (!address) return
    const p = loadProfile(address)
    setForm((f) => ({
      ...f,
      issuerFirstName: p.firstName || f.issuerFirstName,
      issuerLastName:  p.lastName  || f.issuerLastName,
      issuerCompany:   p.company   || f.issuerCompany,
    }))
  }, [activeAccount?.address])

  useEffect(() => {
    if (!submitting) return
    const timer = window.setInterval(() => {
      setSubmittingDots((prev) => (prev % 3) + 1)
    }, 450)
    return () => window.clearInterval(timer)
  }, [submitting])

  function set(field: Exclude<keyof FormState, 'lineItems'>) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function setLineItem(index: number, field: keyof LineItemForm, value: string) {
    setForm((prev) => {
      const next = [...prev.lineItems]
      next[index] = { ...next[index], [field]: value }
      return { ...prev, lineItems: next }
    })
  }

  function addLineItem() {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { title: '', description: '', amount: '' }],
    }))
  }

  function removeLineItem(index: number) {
    setForm((prev) => {
      if (prev.lineItems.length <= 1) return prev
      const next = prev.lineItems.filter((_, i) => i !== index)
      return { ...prev, lineItems: next }
    })
  }

  async function handleCopyAddress() {
    const address = activeAccount?.address
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopiedAddress(true)
    window.setTimeout(() => setCopiedAddress(false), 1500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const normalizedInvoiceTitle = form.invoiceTitle.trim()

    if (!normalizedInvoiceTitle) {
      setFormError('Invoice title is required.')
      return
    }

    const parsedLineItems = form.lineItems
      .map((item) => ({
        title: item.title.trim(),
        description: item.description.trim(),
        amount: Number(item.amount),
      }))
      .filter((item) => item.title && item.description && Number.isFinite(item.amount) && item.amount > 0)

    if (parsedLineItems.length === 0) {
      setFormError('Please add at least one valid service line item.')
      return
    }
    if (!activeAccount?.address) {
      setFormError('Wallet is not ready.')
      return
    }

    setSubmitting(true)
    try {
      const invoiceId = makeInvoiceId()
      const createdAt = new Date().toISOString()
      const issueDate = formatIssueDate(createdAt)
      const dueDateIso = computeDueDateIso(createdAt)
      const dueDate = formatDueDate(createdAt, dueDateIso)
      const selectedToken = getInvoiceTokenBySymbol(form.tokenSymbol)
      const totalAmount = parsedLineItems.reduce((acc, item) => acc + item.amount, 0)

      const doc = await buildInvoicePdf({
        invoiceId,
        issueDate,
        dueDate,
        issuerAddress: activeAccount.address,
        issuerInfo: {
          firstName: form.issuerFirstName || undefined,
          lastName: form.issuerLastName || undefined,
          company: form.issuerCompany || undefined,
        },
        payerAddress: '',
        payerInfo: {
          firstName: form.payerFirstName || undefined,
          lastName: form.payerLastName || undefined,
          company: form.payerCompany || undefined,
        },
        lineItems: parsedLineItems,
        title: normalizedInvoiceTitle,
        tokenSymbol: selectedToken.symbol,
        status: 'sent',
      })

      const pdfBlob = doc.output('blob')
      const pdfHash = await sha256Blob(pdfBlob)

      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          issuerAddress: activeAccount.address,
          issuerFirstName: form.issuerFirstName || undefined,
          issuerLastName: form.issuerLastName || undefined,
          issuerCompany: form.issuerCompany || undefined,
          issuerInfo: {
            firstName: form.issuerFirstName || undefined,
            lastName: form.issuerLastName || undefined,
            company: form.issuerCompany || undefined,
          },
          payerAddress: '',
          payerFirstName: form.payerFirstName || undefined,
          payerLastName: form.payerLastName || undefined,
          payerCompany: form.payerCompany || undefined,
          payerInfo: {
            firstName: form.payerFirstName || undefined,
            lastName: form.payerLastName || undefined,
            company: form.payerCompany || undefined,
          },
          lineItems: parsedLineItems,
          title: normalizedInvoiceTitle,
          description: parsedLineItems[0].description,
          amount: totalAmount,
          tokenAddress: selectedToken.address,
          tokenSymbol: selectedToken.symbol,
          currencySymbol: selectedToken.symbol,
          status: 'sent',
          rejectionReason: null,
          pdfHash,
          createdAt,
          dueDate: dueDateIso,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create invoice')
      }

      toast.show('Invoice created successfully.')
      const data = await res.json()
      const id = (data.invoice?._id ?? data.invoice?.invoiceId ?? data.id) as string
      navigate(`/invoices/${id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="px-8 py-10 max-w-2xl">
      <h1 className="text-2xl font-semibold text-nyx-text tracking-tight mb-8">Create Invoice</h1>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Issuer */}
        <div className="nyx-card p-6">
          <SectionLabel>Issuer</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="First Name">
              <input className={inputCls} value={form.issuerFirstName} onChange={set('issuerFirstName')} placeholder="Jane" />
            </Field>
            <Field label="Last Name">
              <input className={inputCls} value={form.issuerLastName} onChange={set('issuerLastName')} placeholder="Doe" />
            </Field>
          </div>
          <Field label="Company">
            <input className={inputCls} value={form.issuerCompany} onChange={set('issuerCompany')} placeholder="Acme Corp" />
          </Field>
          <div className="mt-4 pt-4 border-t border-nyx-border">
            <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase mb-2">Your Unlink Address</p>
            <div
              className="relative group cursor-pointer inline-block w-full"
              onClick={handleCopyAddress}
            >
              <p className={`font-mono text-sm break-all transition-colors duration-150 select-none ${
                copiedAddress ? 'text-nyx-success' : 'text-nyx-text group-hover:text-nyx-accent'
              }`}>
                {copiedAddress ? 'Copied!' : (activeAccount?.address ?? 'Wallet not ready')}
              </p>
              {!copiedAddress && (
                <span className="absolute -top-7 left-0 text-[10px] text-nyx-muted bg-nyx-secondary border border-nyx-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-10">
                  Click to copy
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Payer */}
        <div className="nyx-card p-6">
          <SectionLabel>Payer</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="First Name">
              <input className={inputCls} value={form.payerFirstName} onChange={set('payerFirstName')} placeholder="John" />
            </Field>
            <Field label="Last Name">
              <input className={inputCls} value={form.payerLastName} onChange={set('payerLastName')} placeholder="Smith" />
            </Field>
          </div>
          <Field label="Company">
            <input className={inputCls} value={form.payerCompany} onChange={set('payerCompany')} placeholder="Client Corp" />
          </Field>
        </div>

        {/* Invoice Details */}
        <div className="nyx-card p-6">
          <SectionLabel>Invoice Details</SectionLabel>
          <div className="space-y-4">
            <Field label="Invoice Title" required>
              <input
                className={inputCls}
                value={form.invoiceTitle}
                onChange={set('invoiceTitle')}
                placeholder="Service Agreement — Q1 2026"
                required
              />
            </Field>
            {form.lineItems.map((item, index) => (
              <div key={index} className="rounded-lg border border-nyx-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-nyx-muted">Service {index + 1}</p>
                  {form.lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="text-xs text-nyx-danger hover:opacity-85"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <Field label="Title" required>
                  <input
                    className={inputCls}
                    value={item.title}
                    onChange={(e) => setLineItem(index, 'title', e.target.value)}
                    placeholder="Service title"
                    required
                  />
                </Field>
                <Field label="Description" required>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={2}
                    value={item.description}
                    onChange={(e) => setLineItem(index, 'description', e.target.value)}
                    placeholder="Describe this service line"
                    required
                  />
                </Field>
                <Field label="Amount" required>
                  <input
                    className={inputCls}
                    type="number"
                    min="0"
                    step="any"
                    value={item.amount}
                    onChange={(e) => setLineItem(index, 'amount', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </Field>
              </div>
            ))}

            <button type="button" onClick={addLineItem} className="btn-secondary">
              Add Service Line
            </button>

            <Field label="Token" required>
              <select
                className="w-full bg-nyx-bg border border-nyx-border rounded-lg text-nyx-muted text-sm font-mono px-3 py-2.5 focus:outline-none focus:border-nyx-accent transition-colors duration-150"
                value={form.tokenSymbol}
                onChange={(e) => setForm((f) => ({ ...f, tokenSymbol: e.target.value as FormState['tokenSymbol'] }))}
              >
                {INVOICE_TOKEN_OPTIONS.map((opt) => (
                  <option key={opt.symbol} value={opt.symbol} style={{ backgroundColor: '#0E1428' }}>
                    {opt.symbol}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {formError && (
          <p className="text-nyx-danger text-sm">{formError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary"
        >
          {submitting ? `Creating Invoice${'.'.repeat(submittingDots)}` : 'Create Invoice'}
        </button>

      </form>
    </main>
  )
}
