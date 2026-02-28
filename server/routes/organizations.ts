import { Router, Request, Response } from 'express'
import { orgDb, toPublicOrg, type OrgMemberRole, type SalarySchedule } from '../db.js'

export const organizationsRouter = Router()

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function normalizeAddress(address: string): string {
  return address.trim()
}

// GET /api/organizations?owner=... — list organizations by owner
organizationsRouter.get('/organizations', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const owner = req.query.owner as string | undefined
    if (!owner) {
      res.status(400).json({ error: 'owner query param is required' })
      return
    }
    const docs = await orgDb.listByOwner(normalizeAddress(owner))
    res.json(docs.map(toPublicOrg))
  } catch (err) {
    console.error('[GET /api/organizations]', err)
    res.status(500).json({ error: 'Failed to fetch organizations' })
  }
})

// POST /api/organizations — create organization
organizationsRouter.post('/organizations', async (req: Request, res: Response) => {
  try {
    const { name, ownerAddress, members } = req.body ?? {}

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    if (!ownerAddress || typeof ownerAddress !== 'string') {
      res.status(400).json({ error: 'ownerAddress is required' })
      return
    }

    const now = new Date().toISOString()
    const doc = {
      name: name.trim(),
      ownerAddress: normalizeAddress(ownerAddress),
      members: Array.isArray(members) ? members : [],
      createdAt: now,
    }

    const id = await orgDb.create(doc)
    const created = await orgDb.getById(id)
    res.status(201).json({ ok: true, id, organization: created ? toPublicOrg(created) : null })
  } catch (err) {
    console.error('[POST /api/organizations]', err)
    res.status(500).json({ error: 'Failed to create organization' })
  }
})

// GET /api/organizations/:id — organization detail
organizationsRouter.get('/organizations/:id', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const doc = await orgDb.getById(req.params.id)
    if (!doc) {
      res.status(404).json({ error: 'Organization not found' })
      return
    }
    res.json(toPublicOrg(doc))
  } catch (err) {
    console.error('[GET /api/organizations/:id]', err)
    res.status(500).json({ error: 'Failed to fetch organization' })
  }
})

// PATCH /api/organizations/:id — add member OR update member salary
organizationsRouter.patch('/organizations/:id', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const { action } = req.body ?? {}

    // — Update salary for an existing member —
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
      const doc = await orgDb.updateMember(req.params.id, normalizeAddress(memberAddress), patch)
      if (!doc) {
        res.status(404).json({ error: 'Organization or member not found' })
        return
      }
      res.json({ ok: true, organization: toPublicOrg(doc) })
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
      address: normalizeAddress(address),
      role: role as OrgMemberRole,
      firstName: typeof firstName === 'string' && firstName.trim() ? firstName.trim() : undefined,
      lastName: typeof lastName === 'string' && lastName.trim() ? lastName.trim() : undefined,
      companyRole: typeof companyRole === 'string' && companyRole.trim() ? companyRole.trim() : undefined,
      joinedAt: new Date().toISOString(),
    }
    const doc = await orgDb.addMember(req.params.id, member)
    if (!doc) {
      res.status(404).json({ error: 'Organization not found' })
      return
    }
    res.json({ ok: true, organization: toPublicOrg(doc) })
  } catch (err) {
    console.error('[PATCH /api/organizations/:id]', err)
    res.status(500).json({ error: 'Failed to update organization' })
  }
})
