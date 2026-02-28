import { Router, Request, Response } from 'express'
import { getDb } from '../db.js'

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

    const doc = {
      issuerAddress,
      issuerFirstName: issuerFirstName || undefined,
      issuerLastName:  issuerLastName  || undefined,
      issuerCompany:   issuerCompany   || undefined,
      payerAddress,
      payerFirstName:  payerFirstName  || undefined,
      payerLastName:   payerLastName   || undefined,
      payerCompany:    payerCompany    || undefined,
      title,
      description,
      amount: Number(amount),
      currency: 'USDC' as const,
      status: 'sent' as const,
      createdAt: new Date(),
    }

    const db = await getDb()
    const result = await db.collection('contracts').insertOne(doc)
    res.status(201).json({ ok: true, id: result.insertedId })
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

    const db = await getDb()
    const docs = await db
      .collection('contracts')
      .find({ $or: [{ issuerAddress: address }, { payerAddress: address }] })
      .sort({ createdAt: -1 })
      .toArray()

    res.json(docs)
  } catch (err) {
    console.error('[GET /api/contracts]', err)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
})
