import { useUnlink } from '@unlink-xyz/react'
import { Wallet, Activity, Wifi } from 'lucide-react'

export default function Home() {
  const { activeAccount } = useUnlink()

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-12">
        <h1 className="text-3xl font-semibold text-nyx-text mb-2 tracking-tight">Dashboard</h1>
        <p className="text-nyx-muted">Your private financial layer on Monad.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="nyx-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={14} className="text-nyx-muted" strokeWidth={1.5} />
            <p className="text-nyx-muted text-xs uppercase tracking-widest">Private Balance</p>
          </div>
          <p className="text-2xl font-semibold text-nyx-text">—</p>
          <p className="text-nyx-muted text-xs mt-1.5">No tokens tracked yet</p>
        </div>

        <div className="nyx-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-nyx-muted" strokeWidth={1.5} />
            <p className="text-nyx-muted text-xs uppercase tracking-widest">Transactions</p>
          </div>
          <p className="text-2xl font-semibold text-nyx-text">0</p>
          <p className="text-nyx-muted text-xs mt-1.5">No history yet</p>
        </div>

        <div className="nyx-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wifi size={14} className="text-nyx-muted" strokeWidth={1.5} />
            <p className="text-nyx-muted text-xs uppercase tracking-widest">Network</p>
          </div>
          <p className="text-sm font-medium text-nyx-success">Monad Testnet</p>
          <p className="text-nyx-muted text-xs mt-1.5">Connected</p>
        </div>
      </div>

      <div className="nyx-card p-8 text-center">
        <p className="text-nyx-muted text-xs uppercase tracking-widest mb-3">Your private address</p>
        <p className="font-mono text-nyx-text text-sm break-all">{activeAccount?.address}</p>
        <p className="text-nyx-muted text-xs mt-5">
          Invoices, transfers, and payroll features coming soon.
        </p>
      </div>
    </main>
  )
}
