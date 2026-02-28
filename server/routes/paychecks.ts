import { Router, Request, Response } from 'express'
import { paycheckDb, toPublicPaycheck, type PaycheckDoc, type SalarySchedule } from '../db.js'

export const paychecksRouter = Router()

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

// GET /api/paychecks?orgId=&memberAddress=
paychecksRouter.get('/paychecks', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const { orgId, memberAddress } = req.query as Record<string, string>
    if (!orgId || !memberAddress) {
      res.status(400).json({ error: 'orgId and memberAddress are required' })
      return
    }
    const docs = await paycheckDb.listByMember(orgId, memberAddress)
    res.json(docs.map(toPublicPaycheck))
  } catch (err) {
    console.error('[GET /api/paychecks]', err)
    res.status(500).json({ error: 'Failed to fetch paychecks' })
  }
})

// POST /api/paychecks — create paycheck after confirmed payment
paychecksRouter.post('/paychecks', async (req: Request, res: Response) => {
  try {
    const {
      payrollId, organizationId, organizationName,
      memberAddress, memberName, amount, currency,
      schedule, executedAt, txHash, relayId, status, pdfHash,
    } = req.body ?? {}

    if (!payrollId || !organizationId || !memberAddress || !amount || !currency || !schedule || !pdfHash) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const now = new Date().toISOString()
    const doc: PaycheckDoc = {
      payrollId,
      organizationId,
      organizationName: organizationName ?? '',
      memberAddress,
      memberName: memberName ?? undefined,
      amount: Number(amount),
      currency,
      schedule: schedule as SalarySchedule,
      executedAt: executedAt ?? now,
      txHash: txHash ?? undefined,
      relayId: relayId ?? undefined,
      status: status ?? 'pending',
      pdfHash,
      createdAt: now,
    }

    const id = await paycheckDb.create(doc)
    res.status(201).json({ ok: true, id })
  } catch (err) {
    console.error('[POST /api/paychecks]', err)
    res.status(500).json({ error: 'Failed to create paycheck' })
  }
})

// PATCH /api/paychecks/:id — confirm / fail
paychecksRouter.patch('/paychecks/:id', async (req: Request, res: Response) => {
  try {
    setNoStore(res)
    const patch: Partial<PaycheckDoc> = {}
    if (req.body.status   !== undefined) patch.status  = req.body.status
    if (req.body.txHash   !== undefined) patch.txHash  = req.body.txHash
    if (req.body.relayId  !== undefined) patch.relayId = req.body.relayId
    if (req.body.pdfHash  !== undefined) patch.pdfHash = req.body.pdfHash

    const doc = await paycheckDb.patchById(req.params.id, patch)
    if (!doc) { res.status(404).json({ error: 'Paycheck not found' }); return }
    res.json({ ok: true, paycheck: toPublicPaycheck(doc) })
  } catch (err) {
    console.error('[PATCH /api/paychecks/:id]', err)
    res.status(500).json({ error: 'Failed to update paycheck' })
  }
})
