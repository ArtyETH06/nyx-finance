import { Building2, FileText, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

function ServiceCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="nyx-card p-5">
      <div className="w-9 h-9 rounded-lg bg-[rgba(108,92,231,0.12)] text-nyx-accent flex items-center justify-center mb-3">
        <Icon size={16} strokeWidth={1.6} />
      </div>
      <h3 className="text-nyx-text font-medium mb-1">{title}</h3>
      <p className="text-nyx-muted text-sm leading-relaxed">{description}</p>
    </div>
  )
}

export default function Home() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <section className="nyx-card p-6 md:p-7">
        <p className="text-[10px] uppercase tracking-[0.22em] text-nyx-muted mb-3">NYX Platform</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-nyx-text mb-4">
          Private invoicing on public blockchain.
        </h1>
        <p className="text-nyx-muted text-sm md:text-base max-w-3xl leading-relaxed">
          Create invoices, generate official PDFs, and settle payments on-chain - without exposing amounts or business relationships.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/invoices" className="btn-primary" style={{ width: 'auto', padding: '9px 16px' }}>
            Open Invoices
          </Link>
          <Link to="/wallet" className="btn-secondary" style={{ width: 'auto', padding: '9px 16px' }}>
            Open Wallet
          </Link>
          <Link to="/profile" className="btn-secondary" style={{ width: 'auto', padding: '9px 16px' }}>
            Open Profile
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-nyx-text tracking-tight">One workflow. Built for invoicing.</h2>
          <p className="text-nyx-muted text-sm mt-1">Generate invoices, store tamper-proof proof on-chain, and get paid privately.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ServiceCard
            icon={FileText}
            title="Private Invoicing"
            description="Issue, approve, and settle invoices without revealing amounts or counterparties."
          />
          <ServiceCard
            icon={Building2}
            title="PDF + On-chain Proof"
            description="Generate professional PDFs and anchor document integrity on-chain with encrypted invoice data."
          />
        </div>
      </section>

    </main>
  )
}
