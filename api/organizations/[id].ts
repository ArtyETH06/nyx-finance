import { orgDb, toPublicOrg, type OrgMemberRole, type SalarySchedule } from '../../server/db.js'

function setNoStore(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function getId(query: any): string | null {
  const raw = query?.id
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim()
  return null
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  const id = getId(req.query)
  if (!id) {
    res.status(400).json({ error: 'Organization id is required' })
    return
  }

  if (req.method === 'GET') {
    try {
      const doc = await orgDb.getById(id)
      if (!doc) {
        res.status(404).json({ error: 'Organization not found' })
        return
      }
      res.status(200).json(toPublicOrg(doc))
      return
    } catch (err) {
      console.error('[GET /api/organizations/:id]', err)
      res.status(500).json({ error: 'Failed to fetch organization' })
      return
    }
  }

  if (req.method === 'PATCH' || req.method === 'POST') {
    try {
      const { action } = req.body ?? {}

      // — Update salary for existing member —
      if (action === 'updateSalary') {
        const { memberAddress, salary, salaryCurrency, salarySchedule } = req.body ?? {}
        if (!memberAddress || typeof memberAddress !== 'string') {
          res.status(400).json({ error: 'memberAddress is required' })
          return
        }
        const validSchedules: SalarySchedule[] = ['weekly', 'biweekly', 'monthly']
        const patch: Parameters<typeof orgDb.updateMember>[2] = {}
        if (salary !== undefined) patch.salary = Number(salary)
        if (salaryCurrency !== undefined) patch.salaryCurrency = String(salaryCurrency)
        if (salarySchedule !== undefined && validSchedules.includes(salarySchedule)) {
          patch.salarySchedule = salarySchedule as SalarySchedule
        }
        const doc = await orgDb.updateMember(id, memberAddress.trim(), patch)
        if (!doc) {
          res.status(404).json({ error: 'Organization or member not found' })
          return
        }
        res.status(200).json({ ok: true, organization: toPublicOrg(doc) })
        return
      }

      // — Add a new member —
      const { address, role, firstName, lastName, companyRole } = req.body ?? {}
      if (!address || typeof address !== 'string' || !address.trim()) {
        res.status(400).json({ error: 'address is required' })
        return
      }
      if (!role || (role !== 'admin' && role !== 'member')) {
        res.status(400).json({ error: 'role must be admin or member' })
        return
      }
      const member = {
        address: address.trim(),
        role: role as OrgMemberRole,
        firstName: typeof firstName === 'string' && firstName.trim() ? firstName.trim() : undefined,
        lastName: typeof lastName === 'string' && lastName.trim() ? lastName.trim() : undefined,
        companyRole: typeof companyRole === 'string' && companyRole.trim() ? companyRole.trim() : undefined,
        joinedAt: new Date().toISOString(),
      }
      const doc = await orgDb.addMember(id, member)
      if (!doc) {
        res.status(404).json({ error: 'Organization not found' })
        return
      }
      res.status(200).json({ ok: true, organization: toPublicOrg(doc) })
      return
    } catch (err) {
      console.error('[PATCH /api/organizations/:id]', err)
      res.status(500).json({ error: 'Failed to update organization' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
