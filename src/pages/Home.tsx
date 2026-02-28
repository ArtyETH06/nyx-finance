import { ArrowRight, FileText, ShieldCheck, Wallet, Workflow, Zap, type LucideIcon } from 'lucide-react'
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
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <section className="nyx-card p-8 md:p-10">
        <p className="text-[10px] uppercase tracking-[0.22em] text-nyx-muted mb-3">NYX Platform</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-nyx-text mb-4">
          Private business operations on public blockchain rails.
        </h1>
        <p className="text-nyx-muted text-sm md:text-base max-w-3xl leading-relaxed">
          NYX helps teams invoice, settle payments, and manage treasury flows with privacy by default.
          Contracts are visible to participants only, while settlement proofs remain verifiable on-chain.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/invoices" className="btn-primary" style={{ width: 'auto', padding: '9px 16px' }}>
            Open Invoices
            <ArrowRight size={14} strokeWidth={1.5} />
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
          <h2 className="text-xl font-semibold text-nyx-text tracking-tight">Services You Offer With NYX</h2>
          <p className="text-nyx-muted text-sm mt-1">Core business services currently available in your app.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <ServiceCard
            icon={FileText}
            title="Private Invoicing"
            description="Create contracts, issue professional invoice PDFs, and track accepted/rejected/paid states with shared persistence."
          />
          <ServiceCard
            icon={Workflow}
            title="Invoice Workflow"
            description="Run full sender-receiver lifecycle: sent, review, reject with reason, accept and pay, then publish payment proof."
          />
          <ServiceCard
            icon={Wallet}
            title="Private Wallet Ops"
            description="Deposit, withdraw, and transfer supported Monad testnet tokens from your Unlink private account."
          />
          <ServiceCard
            icon={Zap}
            title="On-Chain Settlement"
            description="Settle invoices through Unlink and keep relay ID + transaction proof attached to each paid contract."
          />
          <ServiceCard
            icon={ShieldCheck}
            title="Proof + Audit Trail"
            description="Attach deterministic PDF hash and payment evidence for better verification and enterprise-grade traceability."
          />
          <ServiceCard
            icon={ShieldCheck}
            title="Privacy-First Experience"
            description="Business data stays participant-focused while still benefiting from public chain finality and transparency."
          />
        </div>
      </section>

    </main>
  )
}
