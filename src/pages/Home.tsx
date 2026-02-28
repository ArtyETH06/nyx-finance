import { useUnlink } from '@unlink-xyz/react'

export default function Home() {
  const { activeAccount } = useUnlink()

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-12">
        <h1 className="text-3xl font-semibold text-nyx-text mb-2">Dashboard</h1>
        <p className="text-nyx-muted">Your private financial layer on Monad.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <div className="bg-nyx-card border border-nyx-border rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-2">Private Balance</p>
          <p className="text-2xl font-semibold text-nyx-text">—</p>
          <p className="text-nyx-muted text-xs mt-1">No tokens tracked yet</p>
        </div>

        <div className="bg-nyx-card border border-nyx-border rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-2">Transactions</p>
          <p className="text-2xl font-semibold text-nyx-text">0</p>
          <p className="text-nyx-muted text-xs mt-1">No history yet</p>
        </div>

        <div className="bg-nyx-card border border-nyx-border rounded-xl p-6">
          <p className="text-nyx-muted text-xs uppercase tracking-wider mb-2">Network</p>
          <p className="text-sm font-medium text-nyx-success">Monad Testnet</p>
          <p className="text-nyx-muted text-xs mt-1">Connected</p>
        </div>
      </div>

      <div className="bg-nyx-card border border-nyx-border rounded-xl p-8 text-center">
        <p className="text-nyx-muted text-sm mb-1">Your private address</p>
        <p className="font-mono text-nyx-text text-sm break-all">{activeAccount?.address}</p>
        <p className="text-nyx-muted text-xs mt-4">
          Invoices, transfers, and payroll features coming soon.
        </p>
      </div>
    </main>
  )
}
