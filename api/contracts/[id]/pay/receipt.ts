import { PaymentFlowError, storeInvoiceReceipt } from '../../../../server/services/invoicePayment.js'

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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const id = getId(req.query)
  if (!id) {
    res.status(400).json({ error: 'Invoice id is required' })
    return
  }

  try {
    const data = await storeInvoiceReceipt(id, {
      receiptHash: String(req.body?.receiptHash ?? ''),
      txHash: String(req.body?.txHash ?? ''),
      payerAddress: String(req.body?.payerAddress ?? ''),
    })
    res.status(201).json(data)
  } catch (err) {
    if (err instanceof PaymentFlowError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[POST /api/contracts/:id/pay/receipt]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Payment flow failed' })
  }
}
