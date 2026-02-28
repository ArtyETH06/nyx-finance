import { db, toPublicInvoice, type InvoiceDoc } from '../../server/db'

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

function pickPatch(body: any): Partial<InvoiceDoc> {
  const patch: Partial<InvoiceDoc> = {}
  if (body?.status != null) patch.status = body.status
  if (body?.rejectionReason !== undefined) patch.rejectionReason = body.rejectionReason
  if (body?.payment !== undefined) patch.payment = body.payment
  if (body?.pdfHash !== undefined) patch.pdfHash = body.pdfHash
  return patch
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  const id = getId(req.query)
  if (!id) {
    res.status(400).json({ error: 'Invoice id is required' })
    return
  }

  if (req.method === 'GET') {
    try {
      const doc = await db.getById(id)
      if (!doc) {
        res.status(404).json({ error: 'Invoice not found' })
        return
      }
      res.status(200).json(toPublicInvoice(doc))
      return
    } catch (err) {
      console.error('[GET /api/contracts/:id]', err)
      res.status(500).json({ error: 'Failed to fetch invoice' })
      return
    }
  }

  if (req.method === 'PATCH' || req.method === 'POST') {
    try {
      const patch = pickPatch(req.body)
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: 'No updatable fields provided' })
        return
      }

      const doc = await db.patchById(id, patch)
      if (!doc) {
        res.status(404).json({ error: 'Invoice not found' })
        return
      }

      res.status(200).json({ ok: true, invoice: toPublicInvoice(doc) })
      return
    } catch (err) {
      console.error('[PATCH/POST /api/contracts/:id]', err)
      res.status(500).json({ error: 'Failed to update invoice' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
