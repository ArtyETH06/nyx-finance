import { db, toPublicInvoice, type InvoiceDoc, type InvoiceStatus } from '../../server/db'

function setNoStore(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
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

function normalizeAddress(address: string): string {
  return address.trim()
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  if (req.method === 'GET') {
    try {
      const address = req.query.address as string | undefined
      if (!address) {
        res.status(400).json({ error: 'address query param is required' })
        return
      }
      const docs = await db.listByAddress(normalizeAddress(address))
      res.status(200).json(docs.map(toPublicInvoice))
      return
    } catch (err) {
      console.error('[GET /api/contracts]', err)
      res.status(500).json({ error: 'Failed to fetch invoices' })
      return
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        invoiceId,
        issuerAddress,
        issuerInfo,
        issuerFirstName,
        issuerLastName,
        issuerCompany,
        payerAddress,
        payerInfo,
        payerFirstName,
        payerLastName,
        payerCompany,
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
      } = req.body ?? {}

      const parsedLineItems = parseLineItems(lineItems)
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
        !payerAddress || typeof payerAddress !== 'string' ||
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
      const mergedIssuerInfo = (issuerInfo && typeof issuerInfo === 'object' ? issuerInfo : {
        firstName: issuerFirstName,
        lastName: issuerLastName,
        company: issuerCompany,
      }) as InvoiceDoc['issuerInfo']
      const mergedPayerInfo = (payerInfo && typeof payerInfo === 'object' ? payerInfo : {
        firstName: payerFirstName,
        lastName: payerLastName,
        company: payerCompany,
      }) as InvoiceDoc['payerInfo']

      const doc: InvoiceDoc = {
        invoiceId,
        issuerAddress: normalizeAddress(issuerAddress),
        payerAddress: normalizeAddress(payerAddress),
        issuerInfo: mergedIssuerInfo,
        payerInfo: mergedPayerInfo,
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
      return
    } catch (err) {
      console.error('[POST /api/contracts]', err)
      res.status(500).json({ error: 'Failed to create invoice' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
