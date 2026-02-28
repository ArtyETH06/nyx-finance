import { Router, Request, Response } from 'express'
import { scheduledPaymentDb, toPublicScheduled, type ScheduledPaymentDoc, type SalarySchedule } from '../db.js'

export const scheduledPaymentsRouter = Router()

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

// GET /api/scheduled-payments?orgId=&memberAddress=
scheduledPaymentsRouter.get('/scheduled-payments', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const { orgId, memberAddress } = req.query as Record<string, string>
    if (!orgId || !memberAddress) {
      res.status(400).json({ error: 'orgId and memberAddress are required' })
      return
    }
    const docs = await scheduledPaymentDb.listByMember(orgId, memberAddress)
    res.json(docs.map(toPublicScheduled))
  } catch (err) {
    console.error('[GET /api/scheduled-payments]', err)
    res.status(500).json({ error: 'Failed to fetch scheduled payments' })
  }
})

// POST /api/scheduled-payments
scheduledPaymentsRouter.post('/scheduled-payments', async (req: Request, res: Response) => {
  try {
    const { organizationId, organizationName, memberAddress, memberName, amount, currency, schedule, scheduledFor } = req.body ?? {}

    if (!organizationId || !memberAddress || !amount || !currency || !schedule || !scheduledFor) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const now = new Date().toISOString()
    const doc: ScheduledPaymentDoc = {
      organizationId,
      organizationName: organizationName ?? '',
      memberAddress,
      memberName: memberName ?? undefined,
      amount: Number(amount),
      currency,
      schedule: schedule as SalarySchedule,
      scheduledFor,
      status: 'scheduled',
      createdAt: now,
    }

    const id = await scheduledPaymentDb.create(doc)
    res.status(201).json({ ok: true, id })
  } catch (err) {
    console.error('[POST /api/scheduled-payments]', err)
    res.status(500).json({ error: 'Failed to create scheduled payment' })
  }
})
