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
      <div className="w-9 h-9 rounded-lg bg-nyx-active text-nyx-accent flex items-center justify-center mb-3">
        <Icon size={16} strokeWidth={1.6} />
      </div>
      <h3 className="text-nyx-text font-medium mb-1">{title}</h3>
      <p className="text-nyx-muted text-sm leading-relaxed">{description}</p>
    </div>
  )
}

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-134px)] max-w-6xl mx-auto px-6 py-8 flex flex-col justify-center gap-6">
      <section className="nyx-card p-6 md:p-7">
        <p className="text-[10px] uppercase tracking-[0.22em] text-nyx-muted mb-3">NYX Platform</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-nyx-text mb-4">
          Business invoicing with private settlement.
        </h1>
        <p className="text-nyx-muted text-sm md:text-base max-w-3xl leading-relaxed">
          NYX lets you issue professional invoices, share a direct payment link, and settle on-chain with verifiable proof while keeping financial intelligence private.
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
          <h2 className="text-xl font-semibold text-nyx-text tracking-tight">One platform. One invoicing flow.</h2>
          <p className="text-nyx-muted text-sm mt-1">From issuance to confirmation, NYX keeps payment operations clear for payers and private for businesses.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ServiceCard
            icon={FileText}
            title="Invoice + Payment Link"
            description="Create invoices with line-item detail, generate a formal PDF, and send a dedicated payment URL to the payer."
          />
          <ServiceCard
            icon={Building2}
            title="Private Settlement + Proof"
            description="Accept MetaMask or card simulation entry, then finalize with on-chain proof, transaction traceability, and paid timestamp."
          />
        </div>
      </section>

    </main>
  )
}
