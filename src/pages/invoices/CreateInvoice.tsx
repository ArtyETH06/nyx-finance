import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { toast } from '../../lib/toast'

interface FormState {
  issuerFirstName: string
  issuerLastName:  string
  issuerCompany:   string
  payerFirstName:  string
  payerLastName:   string
  payerCompany:    string
  payerAddress:    string
  title:           string
  description:     string
  amount:          string
}

const empty: FormState = {
  issuerFirstName: '',
  issuerLastName:  '',
  issuerCompany:   '',
  payerFirstName:  '',
  payerLastName:   '',
  payerCompany:    '',
  payerAddress:    '',
  title:           '',
  description:     '',
  amount:          '',
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
  'w-full bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-nyx-text text-sm placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors duration-150'

export default function CreateInvoice() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(empty)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.payerAddress.trim()) {
      setFormError('Payer ZK address is required.')
      return
    }
    if (!form.title.trim() || !form.description.trim()) {
      setFormError('Title and description are required.')
      return
    }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid amount.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuerAddress:   activeAccount?.address,
          issuerFirstName: form.issuerFirstName || undefined,
          issuerLastName:  form.issuerLastName  || undefined,
          issuerCompany:   form.issuerCompany   || undefined,
          payerAddress:    form.payerAddress.trim(),
          payerFirstName:  form.payerFirstName  || undefined,
          payerLastName:   form.payerLastName   || undefined,
          payerCompany:    form.payerCompany    || undefined,
          title:       form.title.trim(),
          description: form.description.trim(),
          amount,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create invoice')
      }

      toast.show('Invoice created successfully.')
      navigate('/invoices')
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
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
            <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase mb-1">Your ZK Address</p>
            <p className="font-mono text-nyx-muted text-xs break-all">{activeAccount?.address}</p>
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
          <div className="mt-3">
            <Field label="ZK Address" required>
              <input
                className={inputCls}
                value={form.payerAddress}
                onChange={set('payerAddress')}
                placeholder="unlink1..."
                required
              />
            </Field>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="nyx-card p-6">
          <SectionLabel>Invoice Details</SectionLabel>
          <div className="space-y-3">
            <Field label="Title" required>
              <input
                className={inputCls}
                value={form.title}
                onChange={set('title')}
                placeholder="e.g. Design services – March 2026"
                required
              />
            </Field>
            <Field label="Description" required>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={form.description}
                onChange={set('description')}
                placeholder="Describe what this invoice covers..."
                required
              />
            </Field>
            <Field label="Amount" required>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="any"
                  value={form.amount}
                  onChange={set('amount')}
                  placeholder="0.00"
                  required
                />
                <div className="flex-shrink-0 flex items-center px-4 bg-nyx-bg border border-[rgba(255,255,255,0.06)] rounded-lg text-nyx-muted text-sm font-mono select-none">
                  USDC
                </div>
              </div>
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
          {submitting ? 'Creating...' : 'Create Invoice'}
        </button>

      </form>
    </main>
  )
}
