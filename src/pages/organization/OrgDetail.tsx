import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUnlink } from '@unlink-xyz/react'
import { Users, UserPlus, Loader2, ShieldCheck, User } from 'lucide-react'

interface OrgMember {
  address: string
  role: 'admin' | 'member'
  firstName?: string
  lastName?: string
  companyRole?: string
  joinedAt: string
}

interface Organization {
  _id: string
  name: string
  ownerAddress: string
  members: OrgMember[]
  createdAt: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortAddr(addr: string) {
  if (addr.length < 20) return addr
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`
}

function memberDisplayName(m: OrgMember) {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ')
  return null
}

const inputClass = 'w-full bg-[#0E1428] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-nyx-text placeholder:text-nyx-muted focus:outline-none focus:border-nyx-accent transition-colors'

export default function OrgDetail() {
  const { id } = useParams<{ id: string }>()
  const { activeAccount } = useUnlink()
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteAddress, setInviteAddress] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [inviteCompanyRole, setInviteCompanyRole] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

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
    if (!inviteAddress.trim()) {
      setInviteError('Address is required.')
      return
    }
    setInviting(true)
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: inviteAddress.trim(),
          role: inviteRole,
          firstName: inviteFirstName.trim() || undefined,
          lastName: inviteLastName.trim() || undefined,
          companyRole: inviteCompanyRole.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to invite member')
      }
      const data = await res.json()
      setOrg(data.organization)
      resetInviteForm()
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setInviting(false)
    }
  }

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

  return (
    <main className="px-8 py-10 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[rgba(108,92,231,0.1)] flex items-center justify-center">
              <Users size={16} className="text-nyx-accent" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">{org.name}</h1>
          </div>
          <p className="text-nyx-muted text-xs font-mono ml-12">
            Owner: {shortAddr(org.ownerAddress)}
          </p>
        </div>
        {canManage && !showInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UserPlus size={13} strokeWidth={1.5} />
            Invite Member
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="nyx-card p-6 mb-6 space-y-4">
          <h2 className="text-nyx-text font-medium">Invite Member</h2>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-nyx-muted text-xs mb-1.5">First Name</label>
              <input
                type="text"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                placeholder="Alice"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-nyx-muted text-xs mb-1.5">Last Name</label>
              <input
                type="text"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                placeholder="Smith"
                className={inputClass}
              />
            </div>
          </div>

          {/* Company role */}
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">Role in Company</label>
            <input
              type="text"
              value={inviteCompanyRole}
              onChange={(e) => setInviteCompanyRole(e.target.value)}
              placeholder="e.g. Lead Developer, CFO…"
              className={inputClass}
            />
          </div>

          {/* ZK address */}
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">ZK Address <span className="text-nyx-danger">*</span></label>
            <input
              type="text"
              value={inviteAddress}
              onChange={(e) => setInviteAddress(e.target.value)}
              placeholder="0x..."
              autoFocus
              className={`${inputClass} font-mono`}
            />
          </div>

          {/* Permission role */}
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">Permission</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className={inputClass}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {inviteError && <p className="text-nyx-danger text-xs">{inviteError}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={inviting}
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 20px' }}
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : 'Add Member'}
            </button>
            <button type="button" onClick={resetInviteForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Members table */}
      <div className="nyx-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-nyx-text text-sm font-medium">
            Members
            <span className="ml-2 text-nyx-muted text-xs font-normal">({org.members.length})</span>
          </h2>
        </div>

        {org.members.length === 0 ? (
          <div className="px-6 py-10 text-center text-nyx-muted text-sm">No members yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.04)]">
                <th className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-6 py-3">Member</th>
                <th className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-6 py-3">Company Role</th>
                <th className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-6 py-3">Permission</th>
                <th className="text-left text-nyx-muted text-[11px] font-medium tracking-wide uppercase px-6 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m, i) => {
                const displayName = memberDisplayName(m)
                return (
                  <tr
                    key={`${m.address}-${i}`}
                    className="border-b border-[rgba(255,255,255,0.03)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      {displayName && (
                        <p className="text-nyx-text text-sm font-medium leading-tight">
                          {displayName}
                          {m.address === org.ownerAddress && (
                            <span className="ml-2 text-[10px] text-nyx-muted font-normal">(owner)</span>
                          )}
                        </p>
                      )}
                      <p className="font-mono text-xs text-nyx-muted mt-0.5">
                        {shortAddr(m.address)}
                        {!displayName && m.address === org.ownerAddress && (
                          <span className="ml-2 text-[10px]">(owner)</span>
                        )}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-nyx-muted text-xs">
                      {m.companyRole ?? <span className="text-nyx-muted/40">—</span>}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={[
                        'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md',
                        m.role === 'admin'
                          ? 'bg-[rgba(108,92,231,0.14)] text-nyx-accent'
                          : 'bg-[rgba(255,255,255,0.06)] text-nyx-muted',
                      ].join(' ')}>
                        {m.role === 'admin'
                          ? <ShieldCheck size={10} strokeWidth={2} />
                          : <User size={10} strokeWidth={2} />
                        }
                        {m.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-nyx-muted text-xs">{formatDate(m.joinedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
