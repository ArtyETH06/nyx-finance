import { Users, UserCheck, Clock, DollarSign } from 'lucide-react'

const stats = [
  { label: 'Total Teams',            value: '3',           icon: Users,      accent: 'rgba(108,92,231,0.12)', iconColor: 'text-nyx-accent'  },
  { label: 'Total Members',          value: '12',          icon: UserCheck,  accent: 'rgba(34,197,94,0.08)',  iconColor: 'text-nyx-success' },
  { label: 'Total Pending Payments', value: '5',           icon: Clock,      accent: 'rgba(234,179,8,0.12)',  iconColor: 'text-yellow-300'  },
  { label: 'Total To Pay',           value: '4,200 USDC',  icon: DollarSign, accent: 'rgba(108,92,231,0.08)', iconColor: 'text-nyx-accent'  },
]

export default function OrgDashboard() {
  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">Organization</h1>
        <p className="text-nyx-muted text-sm mt-0.5">Overview of your teams and financial activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map(({ label, value, icon: Icon, accent, iconColor }) => (
          <div key={label} className="nyx-card p-6 flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: accent }}
            >
              <Icon size={20} className={iconColor} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-nyx-muted text-xs mb-0.5">{label}</p>
              <p className="text-nyx-text text-xl font-semibold tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
