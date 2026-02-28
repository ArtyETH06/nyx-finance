import { useEffect, useState } from 'react'
import { useUnlink } from '@unlink-xyz/react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, Loader2, ChevronRight } from 'lucide-react'

interface Organization {
  _id: string
  name: string
  ownerAddress: string
  members: { address: string; role: string; joinedAt: string }[]
  createdAt: string
}

export default function Teams() {
  const { activeAccount } = useUnlink()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const address = activeAccount?.address ?? ''

  async function load() {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizations?owner=${encodeURIComponent(address)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load organizations')
      setOrgs(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [address])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!orgName.trim()) {
      setFormError('Organization name is required.')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          ownerAddress: address,
          members: [{ address, role: 'admin', joinedAt: new Date().toISOString() }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create organization')
      }
      const data = await res.json()
      navigate(`/organization/teams/${data.id}`)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
      setCreating(false)
    }
  }

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-nyx-text tracking-tight">Teams</h1>
          <p className="text-nyx-muted text-sm mt-0.5">Manage your organizations.</p>
        </div>
        {!showForm && orgs.length > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={13} strokeWidth={1.5} />
            New Organization
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="nyx-card p-6 mb-6 space-y-4">
          <h2 className="text-nyx-text font-medium">Create Organization</h2>
          <div>
            <label className="block text-nyx-muted text-xs mb-1.5">Organization Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Acme Corp"
              autoFocus
              className="w-full bg-[#0E1428] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-nyx-text placeholder:text-nyx-muted focus:outline-none focus:border-nyx-accent transition-colors"
            />
          </div>
          {formError && <p className="text-nyx-danger text-xs">{formError}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 20px' }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setOrgName(''); setFormError(null) }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-nyx-muted text-sm">
            <Loader2 size={16} className="animate-spin text-nyx-accent" />
            Loading...
          </div>
        </div>
      )}

      {error && (
        <div className="nyx-card p-6 border-nyx-danger/20 text-nyx-danger text-sm">{error}</div>
      )}

      {!loading && !error && orgs.length === 0 && !showForm && (
        <div className="nyx-card p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[rgba(108,92,231,0.08)] border border-[rgba(108,92,231,0.15)] flex items-center justify-center mx-auto mb-4">
            <Users size={22} className="text-nyx-accent" strokeWidth={1.5} />
          </div>
          <p className="text-nyx-text font-medium mb-1">No organization yet.</p>
          <p className="text-nyx-muted text-sm mb-6">Create your first organization to manage teams.</p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
            style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}
          >
            <Plus size={13} strokeWidth={1.5} />
            Create Organization
          </button>
        </div>
      )}

      {!loading && !error && orgs.length > 0 && (
        <div className="space-y-3">
          {orgs.map((org) => (
            <button
              key={org._id}
              onClick={() => navigate(`/organization/teams/${org._id}`)}
              className="nyx-card p-5 flex items-center justify-between gap-4 w-full text-left"
            >
              <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-[rgba(108,92,231,0.1)]">
                <Users size={15} className="text-nyx-accent" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-nyx-text text-sm font-medium truncate">{org.name}</p>
                <p className="text-nyx-muted text-xs mt-0.5">{org.members.length} member{org.members.length !== 1 ? 's' : ''}</p>
              </div>
              <ChevronRight size={15} className="text-nyx-muted flex-shrink-0" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
