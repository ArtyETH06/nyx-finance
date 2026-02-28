import { Router, Request, Response } from 'express'
import { db, toPublicInvoice, type InvoiceDoc, type InvoiceStatus } from '../db.js'

export const contractsRouter = Router()

function normalizeAddress(address: string): string {
  return address.trim()
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

// POST /api/contracts — create invoice
contractsRouter.post('/contracts', async (req: Request, res: Response) => {
  try {
    const {
      invoiceId,
      issuerAddress,
      issuerInfo,
      payerAddress,
      payerInfo,
      title,
      description,
      amount,
      tokenAddress,
      tokenSymbol,
      currencySymbol,
      status,
      rejectionReason,
      pdfHash,
      createdAt,
    } = req.body

    const parsedAmount = parseAmount(amount)
    if (
      !invoiceId || typeof invoiceId !== 'string' ||
      !issuerAddress || typeof issuerAddress !== 'string' ||
      !payerAddress || typeof payerAddress !== 'string' ||
      !title || typeof title !== 'string' ||
      !description || typeof description !== 'string' ||
      parsedAmount == null || parsedAmount <= 0 ||
      !tokenAddress || typeof tokenAddress !== 'string' ||
      !tokenSymbol || typeof tokenSymbol !== 'string' ||
      !currencySymbol || typeof currencySymbol !== 'string' ||
      !status || typeof status !== 'string' ||
      !pdfHash || typeof pdfHash !== 'string'
    ) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const now = new Date().toISOString()
    const doc: InvoiceDoc = {
      invoiceId,
      issuerAddress: normalizeAddress(issuerAddress),
      payerAddress: normalizeAddress(payerAddress),
      issuerInfo: issuerInfo && typeof issuerInfo === 'object' ? issuerInfo : undefined,
      payerInfo: payerInfo && typeof payerInfo === 'object' ? payerInfo : undefined,
      title,
      description,
      amount: parsedAmount,
      tokenAddress,
      tokenSymbol,
      currencySymbol,
      status: status as InvoiceStatus,
      rejectionReason: rejectionReason ?? null,
      pdfHash,
      createdAt: typeof createdAt === 'string' ? createdAt : now,
      updatedAt: now,
    }

    const id = await db.create(doc)
    const created = await db.getById(id)
    res.status(201).json({ ok: true, id, invoice: created ? toPublicInvoice(created) : null })
  } catch (err) {
    console.error('[POST /api/contracts]', err)
    res.status(500).json({ error: 'Failed to create invoice' })
  }
})

// GET /api/contracts?address=... — list invoices for address
contractsRouter.get('/contracts', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const address = req.query.address as string
    if (!address) {
      res.status(400).json({ error: 'address query param is required' })
      return
    }

    const docs = await db.listByAddress(normalizeAddress(address))
    res.json(docs.map(toPublicInvoice))
  } catch (err) {
    console.error('[GET /api/contracts]', err)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
})

// GET /api/contracts/:id — invoice detail
contractsRouter.get('/contracts/:id', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const doc = await db.getById(req.params.id)
    if (!doc) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.json(toPublicInvoice(doc))
  } catch (err) {
    console.error('[GET /api/contracts/:id]', err)
    res.status(500).json({ error: 'Failed to fetch invoice' })
  }
})

// PATCH /api/contracts/:id — partial update (status, rejectionReason, payment, ...)
contractsRouter.patch('/contracts/:id', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const patch: Partial<InvoiceDoc> = {}
    if (req.body.status != null) patch.status = req.body.status
    if (req.body.rejectionReason !== undefined) patch.rejectionReason = req.body.rejectionReason
    if (req.body.payment !== undefined) patch.payment = req.body.payment

    const doc = await db.patchById(req.params.id, patch)
    if (!doc) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.json({ ok: true, invoice: toPublicInvoice(doc) })
  } catch (err) {
    console.error('[PATCH /api/contracts/:id]', err)
    res.status(500).json({ error: 'Failed to update invoice' })
  }
})
