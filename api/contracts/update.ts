import { db, toPublicInvoice, type InvoiceDoc } from '../../server/db'

function setNoStore(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function pickPatch(body: any): Partial<InvoiceDoc> {
  const patch: Partial<InvoiceDoc> = {}
  if (body?.status != null) patch.status = body.status
  if (body?.rejectionReason !== undefined) patch.rejectionReason = body.rejectionReason
  if (body?.payment !== undefined) patch.payment = body.payment
  return patch
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : ''
  if (!id) {
    res.status(400).json({ error: 'id is required' })
    return
  }

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
  } catch (err) {
    console.error('[POST /api/contracts/update]', err)
    res.status(500).json({ error: 'Failed to update invoice' })
  }
}
