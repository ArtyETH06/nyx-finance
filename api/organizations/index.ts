import { orgDb, toPublicOrg } from '../../server/db.js'

function setNoStore(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function normalizeAddress(address: string): string {
  return address.trim()
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  if (req.method === 'GET') {
    try {
      const owner = req.query.owner as string | undefined
      if (!owner) {
        res.status(400).json({ error: 'owner query param is required' })
        return
      }
      const docs = await orgDb.listByOwner(normalizeAddress(owner))
      res.status(200).json(docs.map(toPublicOrg))
      return
    } catch (err) {
      console.error('[GET /api/organizations]', err)
      res.status(500).json({ error: 'Failed to fetch organizations' })
      return
    }
  }

  if (req.method === 'POST') {
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
      return
    } catch (err) {
      console.error('[POST /api/organizations]', err)
      res.status(500).json({ error: 'Failed to create organization' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
