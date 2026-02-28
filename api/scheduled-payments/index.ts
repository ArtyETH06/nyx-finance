import { scheduledPaymentDb, toPublicScheduled, type ScheduledPaymentDoc, type SalarySchedule } from '../../server/db.js'

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
      const docs = await scheduledPaymentDb.listByMember(String(orgId), String(memberAddress))
      res.status(200).json(docs.map(toPublicScheduled))
      return
    } catch (err) {
      console.error('[GET /api/scheduled-payments]', err)
      res.status(500).json({ error: 'Failed to fetch scheduled payments' })
      return
    }
  }

  if (req.method === 'POST') {
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
      return
    } catch (err) {
      console.error('[POST /api/scheduled-payments]', err)
      res.status(500).json({ error: 'Failed to create scheduled payment' })
      return
    }
  }

  res.status(405).json({ error: 'Method not allowed' })
}
