import { useEffect, useState } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { Users, UserCheck, Clock, DollarSign, Loader2 } from 'lucide-react'

interface OrgMember {
  salary?: number
  salaryCurrency?: string
  salarySchedule?: 'weekly' | 'biweekly' | 'monthly'
}

interface Organization {
  _id: string
  members: OrgMember[]
}

function toMonthly(m: OrgMember): number {
  const s = m.salary ?? 0
  if (m.salarySchedule === 'weekly')   return s * 4
  if (m.salarySchedule === 'biweekly') return s * 2
  return s
}

export default function OrgDashboard() {
  const { activeAccount } = useUnlink()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  const address = activeAccount?.address ?? ''

  useEffect(() => {
    if (!address) return
    fetch(`/api/organizations?owner=${encodeURIComponent(address)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { setOrgs(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [address])

  const totalTeams   = orgs.length
  const totalMembers = orgs.reduce((sum, o) => sum + o.members.length, 0)
  const onSalary     = orgs.reduce((sum, o) => sum + o.members.filter((m) => (m.salary ?? 0) > 0).length, 0)
  const totalPayroll = orgs.reduce((sum, o) =>
    sum + o.members.reduce((s, m) => s + toMonthly(m), 0), 0)

  const stats = [
    {
      label:      'Total Teams',
      value:      loading ? '—' : String(totalTeams),
      icon:       Users,
      accent:     'rgba(108,92,231,0.12)',
      iconColor:  'text-nyx-accent',
    },
    {
      label:      'Total Members',
      value:      loading ? '—' : String(totalMembers),
      icon:       UserCheck,
      accent:     'rgba(34,197,94,0.08)',
      iconColor:  'text-nyx-success',
    },
    {
      label:      'On Salary',
      value:      loading ? '—' : `${onSalary} / ${totalMembers}`,
      icon:       Clock,
      accent:     'rgba(234,179,8,0.12)',
      iconColor:  'text-yellow-300',
    },
    {
      label:      'Monthly Payroll',
      value:      loading ? '—' : totalPayroll > 0
        ? `${totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
        : '—',
      icon:       DollarSign,
      accent:     'rgba(108,92,231,0.08)',
      iconColor:  'text-nyx-accent',
    },
  ]

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">Organization</h1>
        <p className="text-nyx-muted text-sm mt-0.5">Overview of your teams and financial activity.</p>
      </div>

      {loading ? (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-nyx-muted text-sm">
            <Loader2 size={16} className="animate-spin text-nyx-accent" />
            Loading...
          </div>
        </div>
      ) : (
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
      )}
    </main>
  )
}
