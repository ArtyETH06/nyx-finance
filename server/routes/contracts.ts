import { Router, Request, Response } from 'express'
import { db } from '../db.js'

export const contractsRouter = Router()

// POST /api/contracts — create invoice
contractsRouter.post('/contracts', async (req: Request, res: Response) => {
  try {
    const {
      issuerAddress, issuerFirstName, issuerLastName, issuerCompany,
      payerAddress, payerFirstName, payerLastName, payerCompany,
      title, description, amount,
    } = req.body

    if (!issuerAddress || !payerAddress || !title || !description || amount == null) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const doc: Record<string, unknown> = {
      issuerAddress,
      payerAddress,
      title,
      description,
      amount:    Number(amount),
      currency:  'USDC',
      status:    'sent',
      createdAt: new Date().toISOString(),
    }

    if (issuerFirstName) doc.issuerFirstName = issuerFirstName
    if (issuerLastName)  doc.issuerLastName  = issuerLastName
    if (issuerCompany)   doc.issuerCompany   = issuerCompany
    if (payerFirstName)  doc.payerFirstName  = payerFirstName
    if (payerLastName)   doc.payerLastName   = payerLastName
    if (payerCompany)    doc.payerCompany    = payerCompany

    const id = db.insert(doc)
    res.status(201).json({ ok: true, id })
  } catch (err) {
    console.error('[POST /api/contracts]', err)
    res.status(500).json({ error: 'Failed to create invoice' })
  }
})

// GET /api/contracts?address=... — list invoices for address
contractsRouter.get('/contracts', async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string
    if (!address) {
      res.status(400).json({ error: 'address query param is required' })
      return
    }

    const docs = db.query(
      (doc) => doc.issuerAddress === address || doc.payerAddress === address
    )

    res.json(docs)
  } catch (err) {
    console.error('[GET /api/contracts]', err)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
})
