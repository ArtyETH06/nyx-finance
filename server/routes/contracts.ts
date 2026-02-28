import { Router, Request, Response } from 'express'
import { db, toPublicInvoice, type InvoiceDoc, type InvoiceStatus } from '../db.js'
import {
  PaymentFlowError,
  confirmInvoicePayment,
  startInvoicePayment,
  storeInvoiceReceipt,
} from '../services/invoicePayment.js'

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

function parseLineItems(value: unknown): InvoiceDoc['lineItems'] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const raw = item as Record<string, unknown>
      const amount = parseAmount(raw.amount)
      const quantity = raw.quantity == null ? undefined : parseAmount(raw.quantity)
      const unitPrice = raw.unitPrice == null ? undefined : parseAmount(raw.unitPrice)
      if (!raw.title || typeof raw.title !== 'string' || amount == null || amount <= 0) return null
      return {
        title: raw.title.trim(),
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        amount,
        quantity: quantity == null ? undefined : quantity,
        unitPrice: unitPrice == null ? undefined : unitPrice,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function paymentError(res: Response, err: unknown, scope: string) {
  if (err instanceof PaymentFlowError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(scope, err)
  const message = err instanceof Error ? err.message : 'Payment flow failed'
  res.status(500).json({ error: message })
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
      lineItems,
      tokenAddress,
      tokenSymbol,
      currencySymbol,
      status,
      rejectionReason,
      pdfHash,
      createdAt,
      dueDate,
    } = req.body

    const parsedLineItems = parseLineItems(lineItems)
    const resolvedPayerAddress = typeof payerAddress === 'string' ? payerAddress.trim() : ''
    const parsedAmount = parsedLineItems.length > 0
      ? parsedLineItems.reduce((acc, item) => acc + item.amount, 0)
      : parseAmount(amount)
    const resolvedTitle = typeof title === 'string' && title.trim()
      ? title.trim()
      : parsedLineItems[0]?.title ?? ''
    const resolvedDescription = typeof description === 'string' && description.trim()
      ? description.trim()
      : parsedLineItems[0]?.description ?? ''
    if (
      !invoiceId || typeof invoiceId !== 'string' ||
      !issuerAddress || typeof issuerAddress !== 'string' ||
      !resolvedTitle ||
      !resolvedDescription ||
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
      payerAddress: normalizeAddress(resolvedPayerAddress),
      issuerInfo: issuerInfo && typeof issuerInfo === 'object' ? issuerInfo : undefined,
      payerInfo: payerInfo && typeof payerInfo === 'object' ? payerInfo : undefined,
      lineItems: parsedLineItems.length > 0 ? parsedLineItems : undefined,
      title: resolvedTitle,
      description: resolvedDescription,
      amount: parsedAmount,
      tokenAddress,
      tokenSymbol,
      currencySymbol,
      status: status as InvoiceStatus,
      rejectionReason: rejectionReason ?? null,
      pdfHash,
      createdAt: typeof createdAt === 'string' ? createdAt : now,
      dueDate: typeof dueDate === 'string' ? dueDate : undefined,
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

// POST /api/contracts/:id/pay/start — lock invoice and prepare deposit calldata
contractsRouter.post('/contracts/:id/pay/start', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const payerAddress = typeof req.body?.payerAddress === 'string' ? req.body.payerAddress.trim() : ''
    const data = await startInvoicePayment(req.params.id, payerAddress)
    res.json({ ok: true, ...data })
  } catch (err) {
    paymentError(res, err, '[POST /api/contracts/:id/pay/start]')
  }
})

// POST /api/contracts/:id/pay/confirm — confirm relay + private settlement, mark invoice paid
contractsRouter.post('/contracts/:id/pay/confirm', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const data = await confirmInvoicePayment(req.params.id, {
      lockId: String(req.body?.lockId ?? ''),
      payerAddress: String(req.body?.payerAddress ?? ''),
      depositTxHash: typeof req.body?.depositTxHash === 'string' ? req.body.depositTxHash : undefined,
    })
    res.json({ ok: true, ...data })
  } catch (err) {
    paymentError(res, err, '[POST /api/contracts/:id/pay/confirm]')
  }
})

// POST /api/contracts/:id/pay/receipt — store receipt hash and metadata
contractsRouter.post('/contracts/:id/pay/receipt', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const data = await storeInvoiceReceipt(req.params.id, {
      receiptHash: String(req.body?.receiptHash ?? ''),
      txHash: String(req.body?.txHash ?? ''),
      payerAddress: String(req.body?.payerAddress ?? ''),
    })
    res.status(201).json(data)
  } catch (err) {
    paymentError(res, err, '[POST /api/contracts/:id/pay/receipt]')
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
    if (req.body.pdfHash !== undefined) patch.pdfHash = req.body.pdfHash

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

// POST /api/contracts/:id/update — compatibility update route for clients/environments
// where PATCH is blocked by proxy/runtime.
contractsRouter.post('/contracts/:id/update', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const patch: Partial<InvoiceDoc> = {}
    if (req.body.status != null) patch.status = req.body.status
    if (req.body.rejectionReason !== undefined) patch.rejectionReason = req.body.rejectionReason
    if (req.body.payment !== undefined) patch.payment = req.body.payment
    if (req.body.pdfHash !== undefined) patch.pdfHash = req.body.pdfHash

    const doc = await db.patchById(req.params.id, patch)
    if (!doc) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.json({ ok: true, invoice: toPublicInvoice(doc) })
  } catch (err) {
    console.error('[POST /api/contracts/:id/update]', err)
    res.status(500).json({ error: 'Failed to update invoice' })
  }
})

// POST /api/contracts/update — compatibility update route that accepts { id, ...patch }.
contractsRouter.post('/contracts/update', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const id = req.body.id as string | undefined
    if (!id) {
      res.status(400).json({ error: 'id is required' })
      return
    }
    const patch: Partial<InvoiceDoc> = {}
    if (req.body.status != null) patch.status = req.body.status
    if (req.body.rejectionReason !== undefined) patch.rejectionReason = req.body.rejectionReason
    if (req.body.payment !== undefined) patch.payment = req.body.payment
    if (req.body.pdfHash !== undefined) patch.pdfHash = req.body.pdfHash

    const doc = await db.patchById(id, patch)
    if (!doc) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    res.json({ ok: true, invoice: toPublicInvoice(doc) })
  } catch (err) {
    console.error('[POST /api/contracts/update]', err)
    res.status(500).json({ error: 'Failed to update invoice' })
  }
})
