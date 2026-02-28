import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import {
  Users, UserPlus, Loader2, ShieldCheck, User,
  DollarSign, Pencil, Check, X,
} from 'lucide-react'

interface OrgMember {
  address: string
  role: 'admin' | 'member'
  firstName?: string
  lastName?: string
  companyRole?: string
  salary?: number
  salaryCurrency?: string
  salarySchedule?: 'weekly' | 'biweekly' | 'monthly'
  joinedAt: string
}

interface Organization {
  _id: string
  name: string
  ownerAddress: string
  members: OrgMember[]
  createdAt: string
}

const CURRENCIES = ['USDC', 'USDT', 'ETH', 'MON']
const SCHEDULES: { value: OrgMember['salarySchedule']; label: string }[] = [
  { value: 'monthly',  label: 'Monthly'   },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'weekly',   label: 'Weekly'    },
]

function toMonthly(m: OrgMember): number {
  const s = m.salary ?? 0
  if (m.salarySchedule === 'weekly')   return s * 4
  if (m.salarySchedule === 'biweekly') return s * 2
  return s
}

function formatAmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortAddr(addr: string) {
  if (addr.length < 20) return addr
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`
}

function displayName(m: OrgMember): string | null {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ')
  return null
}

const inputCls = 'w-full bg-[#0E1428] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-nyx-text placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors'
const selectCls = `${inputCls} cursor-pointer`

// ─── Payroll bar chart ────────────────────────────────────────────────────────
function PayrollChart({ members }: { members: OrgMember[] }) {
  const withSalary = members.filter((m) => (m.salary ?? 0) > 0)
  if (withSalary.length === 0) return null

  const maxMonthly = Math.max(...withSalary.map(toMonthly))

  return (
    <div className="nyx-card p-6 mb-6">
      <p className="text-nyx-muted text-[10px] font-semibold tracking-widest uppercase mb-5">
        Monthly Payroll Distribution
      </p>
      <div className="space-y-3">
        {withSalary.map((m) => {
          const monthly = toMonthly(m)
          const pct = maxMonthly > 0 ? (monthly / maxMonthly) * 100 : 0
          const name = displayName(m) ?? shortAddr(m.address)
          return (
            <div key={m.address} className="flex items-center gap-3">
              <p className="w-36 text-sm text-nyx-text truncate flex-shrink-0" title={name}>{name}</p>
              <div className="flex-1 h-2 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-nyx-accent transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-nyx-muted tabular-nums flex-shrink-0 w-36 text-right">
                {formatAmt(monthly)} {m.salaryCurrency ?? 'USDC'}<span className="text-nyx-muted/50">/mo</span>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Inline salary editor ─────────────────────────────────────────────────────
interface SalaryEditorProps {
  member: OrgMember
  orgId: string
  onSaved: (org: Organization) => void
  onCancel: () => void
}

function SalaryEditor({ member, orgId, onSaved, onCancel }: SalaryEditorProps) {
  const [salary, setSalary]     = useState(String(member.salary ?? ''))
  const [currency, setCurrency] = useState(member.salaryCurrency ?? 'USDC')
  const [schedule, setSchedule] = useState<OrgMember['salarySchedule']>(member.salarySchedule ?? 'monthly')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    const parsed = parseFloat(salary)
    if (isNaN(parsed) || parsed < 0) {
      setErr('Enter a valid salary amount.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateSalary',
          memberAddress: member.address,
          salary: parsed,
          salaryCurrency: currency,
          salarySchedule: schedule,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to save')
      }
      const d = await res.json()
      onSaved(d.organization)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const monthly = (() => {
    const n = parseFloat(salary)
    if (isNaN(n) || n <= 0) return null
    if (schedule === 'weekly')   return n * 4
    if (schedule === 'biweekly') return n * 2
    return n
  })()

  return (
    <div className="bg-[#0A1020] border-t border-[rgba(255,255,255,0.04)] px-6 py-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-36">
          <label className="block text-nyx-muted text-[10px] uppercase tracking-wide mb-1.5">Amount</label>
          <input
            type="number"
            min="0"
            step="any"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="0.00"
            className={inputCls}
            autoFocus
          />
        </div>
        <div className="w-28">
          <label className="block text-nyx-muted text-[10px] uppercase tracking-wide mb-1.5">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="w-32">
          <label className="block text-nyx-muted text-[10px] uppercase tracking-wide mb-1.5">Schedule</label>
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as OrgMember['salarySchedule'])} className={selectCls}>
            {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <><Check size={13} strokeWidth={2} /> Save</>}
          </button>
          <button onClick={onCancel} className="btn-secondary">
            <X size={13} strokeWidth={1.5} /> Cancel
          </button>
        </div>
      </div>
      {monthly !== null && (
        <p className="text-nyx-muted text-xs mt-2">
          ≈ <span className="text-nyx-text font-medium">{formatAmt(monthly)} {currency}</span> / month
        </p>
      )}
      {err && <p className="text-nyx-danger text-xs mt-2">{err}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrgDetail() {
  const { id } = useParams<{ id: string }>()
  const { activeAccount } = useUnlink()
  const [org, setOrg]         = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Invite form state
  const [showInvite, setShowInvite]           = useState(false)
  const [inviteAddress, setInviteAddress]     = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName]   = useState('')
  const [inviteCompanyRole, setInviteCompanyRole] = useState('')
  const [inviteRole, setInviteRole]           = useState<'admin' | 'member'>('member')
  const [inviting, setInviting]               = useState(false)
  const [inviteError, setInviteError]         = useState<string | null>(null)

  // Salary editor
  const [editingAddress, setEditingAddress] = useState<string | null>(null)

  const currentAddress = activeAccount?.address ?? ''

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizations/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Organization not found')
      setOrg(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const canManage = org
    ? org.ownerAddress === currentAddress ||
      org.members.some((m) => m.address === currentAddress && m.role === 'admin')
    : false

  function resetInviteForm() {
    setShowInvite(false)
    setInviteAddress('')
    setInviteFirstName('')
    setInviteLastName('')
    setInviteCompanyRole('')
    setInviteRole('member')
    setInviteError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError(null)
    if (!inviteAddress.trim()) { setInviteError('Address is required.'); return }
    setInviting(true)
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: inviteAddress.trim(),
          role: inviteRole,
          firstName: inviteFirstName.trim() || undefined,
          lastName:  inviteLastName.trim()  || undefined,
          companyRole: inviteCompanyRole.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to invite member')
      }
      setOrg((await res.json()).organization)
      resetInviteForm()
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setInviting(false)
    }
  }

  // ── Loading / error guards ──
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 text-nyx-muted text-sm">
          <Loader2 size={16} className="animate-spin text-nyx-accent" />
          Loading...
        </div>
      </div>
    )
  }
  if (error || !org) {
    return (
      <main className="px-8 py-10">
        <div className="nyx-card p-6 text-nyx-danger text-sm">{error ?? 'Not found'}</div>
      </main>
    )
  }

  // ── Computed stats ──
  const membersWithSalary = org.members.filter((m) => (m.salary ?? 0) > 0)
  const totalMonthly = membersWithSalary.reduce((sum, m) => sum + toMonthly(m), 0)

  return (
    <main className="px-8 py-10 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[rgba(108,92,231,0.1)] flex items-center justify-center">
              <Users size={16} className="text-nyx-accent" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">{org.name}</h1>
          </div>
          <p className="text-nyx-muted text-xs font-mono ml-12">Owner: {shortAddr(org.ownerAddress)}</p>
        </div>
        {canManage && !showInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UserPlus size={13} strokeWidth={1.5} /> Invite Member
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Members',         value: String(org.members.length),          icon: Users       },
          { label: 'Monthly Payroll', value: membersWithSalary.length > 0 ? `${formatAmt(totalMonthly)} USDC` : '—', icon: DollarSign },
          { label: 'On Salary',       value: `${membersWithSalary.length} / ${org.members.length}`, icon: UserPlus  },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="nyx-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[rgba(108,92,231,0.08)] flex items-center justify-center flex-shrink-0">
              <Icon size={14} className="text-nyx-accent" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-nyx-muted text-[10px] uppercase tracking-wide">{label}</p>
              <p className="text-nyx-text text-sm font-semibold tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Payroll chart ── */}
      <PayrollChart members={org.members} />

      {/* ── Invite form ── */}
      {showInvite && (
        <form onSubmit={handleInvite} className="nyx-card p-6 mb-6 space-y-4">
          <h2 className="text-nyx-text font-medium">Invite Member</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-nyx-muted text-xs mb-1.5">First Name</label>
              <input type="text" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} placeholder="Alice" className={inputCls} />
            </div>
            <div>
              <label className="block text-nyx-muted text-xs mb-1.5">Last Name</label>
              <input type="text" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} placeholder="Smith" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">Role in Company</label>
            <input type="text" value={inviteCompanyRole} onChange={(e) => setInviteCompanyRole(e.target.value)} placeholder="e.g. Lead Developer, CFO…" className={inputCls} />
          </div>
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">ZK Address <span className="text-nyx-danger">*</span></label>
            <input type="text" value={inviteAddress} onChange={(e) => setInviteAddress(e.target.value)} placeholder="0x..." autoFocus className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">Permission</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')} className={selectCls}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {inviteError && <p className="text-nyx-danger text-xs">{inviteError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={inviting} className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }}>
              {inviting ? <Loader2 size={14} className="animate-spin" /> : 'Add Member'}
            </button>
            <button type="button" onClick={resetInviteForm} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* ── Members table ── */}
      <div className="nyx-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-nyx-text text-sm font-medium">
            Members <span className="ml-1 text-nyx-muted text-xs font-normal">({org.members.length})</span>
          </h2>
        </div>

        {org.members.length === 0 ? (
          <div className="px-6 py-10 text-center text-nyx-muted text-sm">No members yet.</div>
        ) : (
          <div>
            {org.members.map((m, i) => {
              const name = displayName(m)
              const isEditing = editingAddress === m.address
              const monthly = toMonthly(m)
              return (
                <div key={`${m.address}-${i}`} className="border-b border-[rgba(255,255,255,0.03)] last:border-0">
                  {/* Member row */}
                  <div className="flex items-center gap-4 px-6 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors">

                    {/* Identity */}
                    <div className="flex-1 min-w-0">
                      {name && (
                        <p className="text-nyx-text text-sm font-medium leading-tight">
                          {name}
                          {m.address === org.ownerAddress && (
                            <span className="ml-2 text-[10px] text-nyx-muted font-normal">(owner)</span>
                          )}
                        </p>
                      )}
                      <p className="font-mono text-xs text-nyx-muted mt-0.5">
                        {shortAddr(m.address)}
                        {!name && m.address === org.ownerAddress && (
                          <span className="ml-2 text-[10px]">(owner)</span>
                        )}
                      </p>
                      {m.companyRole && (
                        <p className="text-nyx-muted text-[11px] mt-0.5">{m.companyRole}</p>
                      )}
                    </div>

                    {/* Permission badge */}
                    <span className={[
                      'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0',
                      m.role === 'admin'
                        ? 'bg-[rgba(108,92,231,0.14)] text-nyx-accent'
                        : 'bg-[rgba(255,255,255,0.06)] text-nyx-muted',
                    ].join(' ')}>
                      {m.role === 'admin' ? <ShieldCheck size={10} strokeWidth={2} /> : <User size={10} strokeWidth={2} />}
                      {m.role}
                    </span>

                    {/* Salary display */}
                    <div className="text-right flex-shrink-0 w-44">
                      {(m.salary ?? 0) > 0 ? (
                        <>
                          <p className="text-nyx-text text-sm font-semibold tabular-nums">
                            {formatAmt(m.salary!)} {m.salaryCurrency ?? 'USDC'}
                          </p>
                          <p className="text-nyx-muted text-[10px]">
                            {SCHEDULES.find((s) => s.value === m.salarySchedule)?.label ?? 'Monthly'}
                            {m.salarySchedule !== 'monthly' && monthly > 0 && (
                              <span className="ml-1 text-nyx-muted/60">≈ {formatAmt(monthly)}/mo</span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-nyx-muted text-xs">No salary set</p>
                      )}
                    </div>

                    {/* Edit salary button */}
                    {canManage && (
                      <button
                        onClick={() => setEditingAddress(isEditing ? null : m.address)}
                        className={[
                          'flex-shrink-0 p-1.5 rounded-lg transition-colors duration-150',
                          isEditing
                            ? 'bg-[rgba(108,92,231,0.12)] text-nyx-accent'
                            : 'text-nyx-muted hover:text-nyx-text hover:bg-[rgba(255,255,255,0.06)]',
                        ].join(' ')}
                        title="Edit salary"
                      >
                        <Pencil size={13} strokeWidth={1.5} />
                      </button>
                    )}

                    {/* Joined date */}
                    <p className="text-nyx-muted text-xs flex-shrink-0 w-24 text-right">{formatDate(m.joinedAt)}</p>
                  </div>

                  {/* Inline salary editor */}
                  {isEditing && (
                    <SalaryEditor
                      member={m}
                      orgId={org._id}
                      onSaved={(updated) => { setOrg(updated); setEditingAddress(null) }}
                      onCancel={() => setEditingAddress(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
