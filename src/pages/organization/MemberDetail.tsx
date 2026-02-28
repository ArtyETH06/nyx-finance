import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { parseAmount, useUnlink } from '@unlink-xyz/react'
import {
  ArrowLeft, Copy, Download, Loader2,
  DollarSign, Calendar, Clock, ShieldCheck, User,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { toast } from '../../lib/toast'
import { buildPayrollPdf, sha256Blob, downloadPdf } from '../../lib/payrollPdf'
import { INVOICE_TOKEN_OPTIONS } from '../../lib/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface Paycheck {
  _id: string
  payrollId: string
  organizationId: string
  organizationName: string
  memberAddress: string
  memberName?: string
  amount: number
  currency: string
  schedule: string
  executedAt: string
  txHash?: string
  relayId?: string
  status: 'pending' | 'confirmed' | 'failed'
  pdfHash: string
  createdAt: string
}

interface ScheduledPayment {
  _id: string
  organizationId: string
  memberAddress: string
  amount: number
  currency: string
  schedule: string
  scheduledFor: string
  status: 'scheduled' | 'executed' | 'cancelled'
}

// ─── Token resolution ─────────────────────────────────────────────────────────

function getToken(currency: string) {
  return (
    INVOICE_TOKEN_OPTIONS.find((t) => t.symbol === currency) ??
    INVOICE_TOKEN_OPTIONS.find((t) => t.symbol === 'USDCm')!
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayrollId() {
  const d = new Date()
  const date = d.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PRY-${date}-${rand}`
}

function fmtAmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function scheduleLabel(s: string) {
  if (s === 'weekly')   return 'Weekly'
  if (s === 'biweekly') return 'Bi-weekly'
  return 'Monthly'
}

function toMonthly(salary: number, schedule?: string) {
  if (schedule === 'weekly')   return salary * 4
  if (schedule === 'biweekly') return salary * 2
  return salary
}

function nextPaymentDate(schedule?: string): string {
  const d = new Date()
  if (schedule === 'weekly')   d.setDate(d.getDate() + 7)
  else if (schedule === 'biweekly') d.setDate(d.getDate() + 14)
  else d.setMonth(d.getMonth() + 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortHash(h: string) {
  if (h.length < 20) return h
  return `${h.slice(0, 12)}…${h.slice(-10)}`
}

function memberDisplayName(m: OrgMember) {
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || null
}

const inputCls = 'w-full bg-[#0E1428] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-nyx-text placeholder:text-nyx-muted/40 focus:outline-none focus:border-nyx-accent transition-colors'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemberDetail() {
  const { id: orgId, memberAddress } = useParams<{ id: string; memberAddress: string }>()
  const navigate = useNavigate()
  const { activeAccount, send, waitForConfirmation, refresh } = useUnlink()

  const [org, setOrg]                   = useState<Organization | null>(null)
  const [member, setMember]             = useState<OrgMember | null>(null)
  const [paychecks, setPaychecks]       = useState<Paycheck[]>([])
  const [scheduled, setScheduled]       = useState<ScheduledPayment[]>([])
  const [loading, setLoading]           = useState(true)
  const [copied, setCopied]             = useState(false)

  // Pay Now
  const [paying, setPaying]             = useState(false)
  const [payStatus, setPayStatus]       = useState<string | null>(null)
  const [paySuccess, setPaySuccess]     = useState(false)

  // Schedule
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedDate, setSchedDate]       = useState('')
  const [schedTime, setSchedTime]       = useState('09:00')
  const [scheduling, setScheduling]     = useState(false)
  const [schedError, setSchedError]     = useState<string | null>(null)

  const currentAddress = activeAccount?.address ?? ''

  // ── Load ──
  async function load() {
    if (!orgId || !memberAddress) return
    setLoading(true)
    try {
      const [orgRes, pcRes, scRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}`, { cache: 'no-store' }),
        fetch(`/api/paychecks?orgId=${encodeURIComponent(orgId)}&memberAddress=${encodeURIComponent(memberAddress)}`, { cache: 'no-store' }),
        fetch(`/api/scheduled-payments?orgId=${encodeURIComponent(orgId)}&memberAddress=${encodeURIComponent(memberAddress)}`, { cache: 'no-store' }),
      ])

      if (orgRes.ok) {
        const orgData: Organization = await orgRes.json()
        setOrg(orgData)
        const m = orgData.members.find(
          (x) => x.address.toLowerCase() === memberAddress!.toLowerCase()
        )
        setMember(m ?? null)
      }
      if (pcRes.ok)  setPaychecks(await pcRes.json())
      if (scRes.ok)  setScheduled(await scRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [orgId, memberAddress])

  // ── Access control ──
  const canManage = org
    ? org.ownerAddress === currentAddress ||
      org.members.some((m) => m.address === currentAddress && m.role === 'admin')
    : false

  const isOwnRecord = memberAddress?.toLowerCase() === currentAddress.toLowerCase()

  // ── Copy address ──
  function handleCopy() {
    if (!memberAddress) return
    navigator.clipboard.writeText(memberAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // ── Pay Now ──
  async function handlePayNow() {
    if (!member?.salary || !memberAddress || !orgId || !org) return
    setPaying(true)
    setPayStatus('Initiating payment...')
    setPaySuccess(false)
    const payrollId = makePayrollId()
    const executedAt = new Date().toISOString()

    try {
      const token = getToken(member.salaryCurrency ?? 'USDCm')
      const amount = parseAmount(String(member.salary), token.decimals)

      setPayStatus('Sending private payment...')
      const result = await send([{
        token: token.address,
        recipient: memberAddress,
        amount,
      }])

      setPayStatus('Waiting for confirmation...')
      const status = await waitForConfirmation(result.relayId, { timeout: 180000 })

      setPayStatus('Generating payroll PDF...')
      const name = memberDisplayName(member) ?? undefined
      const pdfInput = {
        payrollId,
        organizationName: org.name,
        memberName: name,
        memberAddress,
        amount: member.salary,
        currency: member.salaryCurrency ?? 'USDCm',
        schedule: member.salarySchedule ?? 'monthly',
        executedAt,
        txHash: status.txHash,
        relayId: result.relayId,
      }
      const pdfDoc = await buildPayrollPdf(pdfInput)
      const pdfBlob = pdfDoc.output('blob')
      const pdfHash = await sha256Blob(pdfBlob)

      setPayStatus('Recording paycheck...')
      const res = await fetch('/api/paychecks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollId,
          organizationId: orgId,
          organizationName: org.name,
          memberAddress,
          memberName: name,
          amount: member.salary,
          currency: member.salaryCurrency ?? 'USDCm',
          schedule: member.salarySchedule ?? 'monthly',
          executedAt,
          txHash: status.txHash,
          relayId: result.relayId,
          status: 'confirmed',
          pdfHash,
        }),
      })

      if (res.ok) {
        // Refresh paycheck list
        const pcRes = await fetch(
          `/api/paychecks?orgId=${encodeURIComponent(orgId)}&memberAddress=${encodeURIComponent(memberAddress)}`,
          { cache: 'no-store' }
        )
        if (pcRes.ok) setPaychecks(await pcRes.json())
      }

      await refresh()
      setPaySuccess(true)
      setPayStatus(null)
      toast.show(
        `Payroll confirmed — ${payrollId}`,
        'success',
        status.txHash ? `https://testnet.monadexplorer.com/tx/${status.txHash}` : undefined,
      )

      // Auto-download PDF
      downloadPdf(pdfBlob, `${payrollId}.pdf`)

      setTimeout(() => setPaySuccess(false), 4000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed'
      const isInsufficient = msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance')
      setPayStatus(null)
      toast.show(isInsufficient ? 'Insufficient balance — fund your wallet first.' : msg, 'error')
    } finally {
      setPaying(false)
    }
  }

  // ── Schedule Payment ──
  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSchedError(null)
    if (!schedDate || !schedTime) { setSchedError('Date and time are required.'); return }
    if (!member?.salary || !orgId || !org) return

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const scheduledFor = new Date(`${schedDate}T${schedTime}`).toISOString()

    setScheduling(true)
    try {
      const res = await fetch('/api/scheduled-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          organizationName: org.name,
          memberAddress,
          memberName: memberDisplayName(member) ?? undefined,
          amount: member.salary,
          currency: member.salaryCurrency ?? 'USDCm',
          schedule: member.salarySchedule ?? 'monthly',
          scheduledFor,
        }),
      })
      if (!res.ok) throw new Error('Failed to schedule payment')
      const scRes = await fetch(
        `/api/scheduled-payments?orgId=${encodeURIComponent(orgId)}&memberAddress=${encodeURIComponent(memberAddress!)}`,
        { cache: 'no-store' }
      )
      if (scRes.ok) setScheduled(await scRes.json())
      setShowSchedule(false)
      setSchedDate('')
      setSchedTime('09:00')
      toast.show('Payment scheduled.')
      void tz // used for display only
    } catch (e) {
      setSchedError(e instanceof Error ? e.message : 'Error')
    } finally {
      setScheduling(false)
    }
  }

  // ── PDF download from history ──
  async function handleDownloadPdf(pc: Paycheck) {
    const pdfInput = {
      payrollId:        pc.payrollId,
      organizationName: pc.organizationName,
      memberName:       pc.memberName,
      memberAddress:    pc.memberAddress,
      amount:           pc.amount,
      currency:         pc.currency,
      schedule:         pc.schedule,
      executedAt:       pc.executedAt,
      txHash:           pc.txHash,
      relayId:          pc.relayId,
    }
    const pdfDoc = await buildPayrollPdf(pdfInput)
    downloadPdf(pdfDoc.output('blob'), `${pc.payrollId}.pdf`)
  }

  // ── Guards ──
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

  if (!org || !member) {
    return (
      <main className="px-8 py-10">
        <div className="nyx-card p-6 text-nyx-danger text-sm">Member not found.</div>
      </main>
    )
  }

  const name           = memberDisplayName(member)
  const monthly        = member.salary ? toMonthly(member.salary, member.salarySchedule) : 0
  const hasSalary      = (member.salary ?? 0) > 0
  const timezone       = Intl.DateTimeFormat().resolvedOptions().timeZone
  const upcomingScheds = scheduled.filter((s) => s.status === 'scheduled')

  return (
    <main className="px-8 py-10 max-w-3xl">

      {/* ── Back ── */}
      <button
        onClick={() => navigate(`/organization/teams/${orgId}`)}
        className="btn-ghost text-nyx-muted text-sm hover:text-nyx-text mb-8 flex items-center gap-1.5"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to {org.name}
      </button>

      {/* ── Profile card ── */}
      <div className="nyx-card p-6 mb-4">
        <p className="text-nyx-muted text-[10px] uppercase tracking-widest mb-4">Member Profile</p>

        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[rgba(108,92,231,0.1)] flex items-center justify-center flex-shrink-0">
            {member.role === 'admin'
              ? <ShieldCheck size={18} className="text-nyx-accent" strokeWidth={1.5} />
              : <User size={18} className="text-nyx-muted" strokeWidth={1.5} />
            }
          </div>
          <div className="flex-1 min-w-0">
            {name && <p className="text-nyx-text text-lg font-semibold leading-tight">{name}</p>}
            {member.companyRole && <p className="text-nyx-muted text-sm mt-0.5">{member.companyRole}</p>}

            {/* Address */}
            <button
              onClick={handleCopy}
              className="mt-2 flex items-center gap-2 group"
            >
              <span className={`font-mono text-xs break-all text-left transition-colors ${copied ? 'text-nyx-success' : 'text-nyx-muted group-hover:text-nyx-accent'}`}>
                {copied ? 'Copied!' : memberAddress}
              </span>
              {!copied && <Copy size={11} className="text-nyx-muted group-hover:text-nyx-accent flex-shrink-0" strokeWidth={1.5} />}
            </button>

            <div className="flex items-center gap-3 mt-3">
              <span className={[
                'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md',
                member.role === 'admin'
                  ? 'bg-[rgba(108,92,231,0.14)] text-nyx-accent'
                  : 'bg-[rgba(255,255,255,0.06)] text-nyx-muted',
              ].join(' ')}>
                {member.role === 'admin' ? <ShieldCheck size={10} strokeWidth={2} /> : <User size={10} strokeWidth={2} />}
                {member.role}
              </span>
              <span className="text-nyx-muted text-xs">Joined {fmtDate(member.joinedAt)}</span>
            </div>
          </div>
        </div>

        {/* Salary details */}
        {hasSalary ? (
          <div className="mt-5 pt-5 border-t border-[rgba(255,255,255,0.06)] grid grid-cols-3 gap-4">
            {[
              { label: 'Salary',    value: `${fmtAmt(member.salary!)} ${member.salaryCurrency ?? 'USDCm'}` },
              { label: 'Schedule',  value: scheduleLabel(member.salarySchedule ?? 'monthly') },
              { label: 'Monthly ≈', value: `${fmtAmt(monthly)} ${member.salaryCurrency ?? 'USDCm'}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-nyx-muted text-[10px] uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-nyx-text text-sm font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <p className="text-nyx-muted text-sm">No salary configured yet.</p>
          </div>
        )}
      </div>

      {/* ── Payroll Actions (admins only, with salary set) ── */}
      {canManage && hasSalary && (
        <div className="nyx-card p-6 mb-4">
          <p className="text-nyx-muted text-[10px] uppercase tracking-widest mb-4">Payroll</p>

          <div className="flex items-center gap-3 mb-4 p-3 bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.05)]">
            <Calendar size={14} className="text-nyx-muted flex-shrink-0" strokeWidth={1.5} />
            <div>
              <p className="text-nyx-muted text-[10px] uppercase tracking-wide">Next Scheduled Payment</p>
              <p className="text-nyx-text text-sm font-medium">{nextPaymentDate(member.salarySchedule)}</p>
            </div>
          </div>

          {/* Pay Now flow status */}
          {paying && payStatus && (
            <div className="flex items-center gap-2 text-nyx-muted text-sm mb-4">
              <Loader2 size={14} className="animate-spin text-nyx-accent" />
              {payStatus}
            </div>
          )}

          {paySuccess && (
            <div className="flex items-center gap-2 text-nyx-success text-sm mb-4">
              <CheckCircle2 size={16} strokeWidth={1.5} />
              Payment confirmed and PDF downloaded!
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handlePayNow}
              disabled={paying}
              className="btn-primary"
              style={{ width: 'auto', padding: '10px 20px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {paying
                ? <Loader2 size={14} className="animate-spin" />
                : <DollarSign size={14} strokeWidth={1.5} />
              }
              Pay Now
            </button>
            <button
              onClick={() => { setShowSchedule(!showSchedule); setSchedError(null) }}
              className="btn-secondary"
              disabled={paying}
            >
              <Clock size={13} strokeWidth={1.5} />
              Schedule Payment
            </button>
          </div>

          {/* Schedule form */}
          {showSchedule && (
            <form onSubmit={handleSchedule} className="mt-5 pt-5 border-t border-[rgba(255,255,255,0.06)] space-y-3">
              <p className="text-nyx-text text-sm font-medium">Schedule a Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-nyx-muted text-xs mb-1.5">Date</label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-nyx-muted text-xs mb-1.5">Time (HH:MM)</label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-nyx-muted text-xs">
                Timezone: <span className="text-nyx-text">{timezone}</span>
              </p>
              {schedError && <p className="text-nyx-danger text-xs">{schedError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={scheduling} className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }}>
                  {scheduling ? <Loader2 size={13} className="animate-spin" /> : 'Confirm Schedule'}
                </button>
                <button type="button" onClick={() => setShowSchedule(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Member viewing own salary (no pay button) ── */}
      {isOwnRecord && !canManage && hasSalary && (
        <div className="nyx-card p-6 mb-4">
          <p className="text-nyx-muted text-[10px] uppercase tracking-widest mb-3">Your Salary</p>
          <p className="text-nyx-text text-xl font-semibold">
            {fmtAmt(member.salary!)} {member.salaryCurrency ?? 'USDCm'}
            <span className="text-nyx-muted text-sm font-normal ml-2">/ {scheduleLabel(member.salarySchedule ?? 'monthly').toLowerCase()}</span>
          </p>
        </div>
      )}

      {/* ── Upcoming Scheduled Payments ── */}
      {upcomingScheds.length > 0 && (
        <div className="nyx-card overflow-hidden mb-4">
          <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
            <h2 className="text-nyx-text text-sm font-medium flex items-center gap-2">
              <Clock size={13} className="text-nyx-accent" strokeWidth={1.5} />
              Upcoming Payments <span className="text-nyx-muted text-xs font-normal">({upcomingScheds.length})</span>
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.04)]">
                {['Scheduled For', 'Amount', 'Schedule'].map((h) => (
                  <th key={h} className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-6 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingScheds.map((s) => (
                <tr key={s._id} className="border-b border-[rgba(255,255,255,0.03)] last:border-0">
                  <td className="px-6 py-3 text-nyx-text text-xs">{fmtDatetime(s.scheduledFor)}</td>
                  <td className="px-6 py-3 text-nyx-text text-sm font-semibold tabular-nums">{fmtAmt(s.amount)} {s.currency}</td>
                  <td className="px-6 py-3 text-nyx-muted text-xs">{scheduleLabel(s.schedule)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Paycheck History ── */}
      <div className="nyx-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-nyx-text text-sm font-medium">
            Paycheck History <span className="ml-1 text-nyx-muted text-xs font-normal">({paychecks.length})</span>
          </h2>
        </div>

        {paychecks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DollarSign size={24} className="text-nyx-muted/40 mx-auto mb-3" strokeWidth={1} />
            <p className="text-nyx-muted text-sm">No paychecks yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.04)]">
                {['Date', 'Amount', 'Schedule', 'Tx / Relay', 'Status', 'PDF'].map((h) => (
                  <th key={h} className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paychecks.map((pc) => (
                <tr key={pc._id} className="border-b border-[rgba(255,255,255,0.03)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3 text-nyx-muted text-xs">{fmtDatetime(pc.executedAt)}</td>
                  <td className="px-4 py-3 text-nyx-text font-semibold tabular-nums">{fmtAmt(pc.amount)} {pc.currency}</td>
                  <td className="px-4 py-3 text-nyx-muted text-xs">{scheduleLabel(pc.schedule)}</td>
                  <td className="px-4 py-3 text-xs">
                    {pc.txHash ? (
                      <a
                        href={`https://testnet.monadexplorer.com/tx/${pc.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-nyx-accent hover:underline"
                      >
                        {shortHash(pc.txHash)}
                      </a>
                    ) : pc.relayId ? (
                      <span className="font-mono text-nyx-muted">{shortHash(pc.relayId)}</span>
                    ) : (
                      <span className="text-nyx-muted/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md',
                      pc.status === 'confirmed' ? 'bg-[rgba(34,197,94,0.12)] text-nyx-success' :
                      pc.status === 'failed'    ? 'bg-[rgba(239,68,68,0.12)] text-nyx-danger'  :
                                                  'bg-[rgba(234,179,8,0.12)] text-yellow-300',
                    ].join(' ')}>
                      {pc.status === 'confirmed' ? <CheckCircle2 size={9} strokeWidth={2} /> :
                       pc.status === 'failed'    ? <AlertCircle size={9} strokeWidth={2} />  : null}
                      {pc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(canManage || isOwnRecord) && (
                      <button
                        onClick={() => handleDownloadPdf(pc)}
                        className="text-nyx-muted hover:text-nyx-accent transition-colors"
                        title={`Download ${pc.payrollId}`}
                      >
                        <Download size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </main>
  )
}
