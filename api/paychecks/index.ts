import { paycheckDb, toPublicPaycheck, type PaycheckDoc, type SalarySchedule } from '../../server/db.js'

function setNoStore(res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

export default async function handler(req: any, res: any) {
  setNoStore(res)

  if (req.method === 'GET') {
    try {
      const { orgId, memberAddress } = req.query
      if (!orgId || !memberAddress) {
        res.status(400).json({ error: 'orgId and memberAddress are required' })
        return
      }
      const docs = await paycheckDb.listByMember(String(orgId), String(memberAddress))
      res.status(200).json(docs.map(toPublicPaycheck))
      return
    } catch (err) {
      console.error('[GET /api/paychecks]', err)
      res.status(500).json({ error: 'Failed to fetch paychecks' })
      return
    }
  }

  if (req.method === 'POST') {
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
        payrollId, organizationId,
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
      return
    } catch (err) {
      console.error('[POST /api/paychecks]', err)
      res.status(500).json({ error: 'Failed to create paycheck' })
      return
    }
  }

  if (req.method === 'PATCH') {
    try {
      const id = req.query.id as string
      if (!id) { res.status(400).json({ error: 'id required' }); return }
      const patch: Partial<PaycheckDoc> = {}
      if (req.body.status  !== undefined) patch.status  = req.body.status
      if (req.body.txHash  !== undefined) patch.txHash  = req.body.txHash
      if (req.body.relayId !== undefined) patch.relayId = req.body.relayId
      if (req.body.pdfHash !== undefined) patch.pdfHash = req.body.pdfHash
      const doc = await paycheckDb.patchById(id, patch)
      if (!doc) { res.status(404).json({ error: 'Paycheck not found' }); return }
      res.status(200).json({ ok: true, paycheck: toPublicPaycheck(doc) })
      return
    } catch (err) {
      console.error('[PATCH /api/paychecks]', err)
      res.status(500).json({ error: 'Failed to update paycheck' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
