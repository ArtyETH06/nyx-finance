import { randomUUID } from 'crypto'
import { db, receiptDb, toPublicInvoice, type InvoiceDoc, type ReceiptDoc } from '../db.js'
import {
  buildDepositForPayer,
  confirmDepositAndSendPrivately,
  getTemporaryZkAddress,
  toBaseUnits,
} from './unlinkSettlement.js'

const LOCK_TTL_MS = 10 * 60 * 1000

type PaymentLock = NonNullable<InvoiceDoc['paymentLock']>

export class PaymentFlowError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isLikelyEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function nowIso(): string {
  return new Date().toISOString()
}

function activeLock(lock?: InvoiceDoc['paymentLock']): PaymentLock | null {
  if (!lock) return null
  const expiresAt = Date.parse(lock.expiresAt)
  if (Number.isNaN(expiresAt)) return null
  if (expiresAt <= Date.now()) return null
  return lock
}

async function requireInvoice(id: string): Promise<InvoiceDoc> {
  const invoice = await db.getById(id)
  if (!invoice) throw new PaymentFlowError(404, 'Invoice not found')
  return invoice
}

export async function startInvoicePayment(id: string, payerAddress: string) {
  if (!isLikelyEvmAddress(payerAddress)) {
    throw new PaymentFlowError(400, 'A valid payer public address is required')
  }

  const invoice = await requireInvoice(id)
  if (invoice.status !== 'sent') {
    throw new PaymentFlowError(409, 'Invoice is no longer payable')
  }

  const lock = activeLock(invoice.paymentLock)
  if (lock) {
    if (lock.payerAddress.toLowerCase() === payerAddress.toLowerCase() && lock.depositRelayId && lock.depositTo && lock.depositCalldata) {
      return {
        invoice: toPublicInvoice(invoice),
        lockId: lock.lockId,
        temporaryZkAddress: lock.temporaryZkAddress,
        deposit: {
          relayId: lock.depositRelayId,
          to: lock.depositTo,
          calldata: lock.depositCalldata,
          value: lock.depositValue ?? '0',
        },
      }
    }
    throw new PaymentFlowError(409, 'Invoice payment is already in progress')
  }

  const createdAt = nowIso()
  const lockId = randomUUID()
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString()
  const pendingLock: PaymentLock = {
    lockId,
    payerAddress,
    createdAt,
    expiresAt,
  }

  const locked = await db.patchById(id, { paymentLock: pendingLock })
  if (!locked) throw new PaymentFlowError(404, 'Invoice not found')

  let updated: InvoiceDoc | null = null
  try {
    const amount = toBaseUnits(locked.amount, 18)
    const temporary = await getTemporaryZkAddress()
    const deposit = await buildDepositForPayer({
      depositor: payerAddress,
      token: locked.tokenAddress,
      amount,
      temporaryAccountIndex: temporary.index,
    })

    updated = await db.patchById(id, {
      paymentLock: {
        ...pendingLock,
        depositRelayId: deposit.relayId,
        depositTo: deposit.to,
        depositCalldata: deposit.calldata,
        depositValue: deposit.value.toString(),
        temporaryZkAddress: temporary.address,
        temporaryAccountIndex: temporary.index,
      },
    })
    if (!updated) throw new PaymentFlowError(500, 'Failed to persist payment lock')
  } catch (err) {
    await db.patchById(id, { paymentLock: null })
    throw err
  }

  return {
    invoice: toPublicInvoice(updated),
    lockId,
    temporaryZkAddress: updated.paymentLock?.temporaryZkAddress,
    deposit: {
      relayId: updated.paymentLock?.depositRelayId,
      to: updated.paymentLock?.depositTo,
      calldata: updated.paymentLock?.depositCalldata,
      value: updated.paymentLock?.depositValue ?? '0',
    },
  }
}

export async function confirmInvoicePayment(
  id: string,
  payload: {
    lockId: string
    payerAddress: string
    depositTxHash?: string
  },
) {
  const invoice = await requireInvoice(id)
  if (invoice.status !== 'sent') {
    throw new PaymentFlowError(409, 'Invoice is no longer payable')
  }

  const lock = activeLock(invoice.paymentLock)
  if (!lock || lock.lockId !== payload.lockId) {
    throw new PaymentFlowError(409, 'Payment lock is missing or expired')
  }
  if (lock.payerAddress.toLowerCase() !== payload.payerAddress.toLowerCase()) {
    throw new PaymentFlowError(403, 'Lock owner mismatch')
  }
  if (!lock.depositRelayId) {
    throw new PaymentFlowError(409, 'Deposit relay is missing for this payment lock')
  }
  if (typeof lock.temporaryAccountIndex !== 'number') {
    throw new PaymentFlowError(409, 'Temporary settlement account is missing')
  }

  const amount = toBaseUnits(invoice.amount, 18)
  const settlement = await confirmDepositAndSendPrivately({
    depositRelayId: lock.depositRelayId,
    token: invoice.tokenAddress,
    amount,
    recipientZkAddress: invoice.issuerAddress,
    temporaryAccountIndex: lock.temporaryAccountIndex,
    depositTxHash: payload.depositTxHash,
  })

  const paidAt = nowIso()
  const updated = await db.patchById(id, {
    status: 'paid',
    rejectionReason: null,
    paymentLock: null,
    payment: {
      relayId: settlement.relayId,
      txHash: settlement.txHash ?? payload.depositTxHash,
      paidAt,
      payerAddress: payload.payerAddress,
      depositRelayId: lock.depositRelayId,
      depositTxHash: payload.depositTxHash,
    },
  })

  if (!updated) throw new PaymentFlowError(500, 'Failed to mark invoice as paid')
  return { invoice: toPublicInvoice(updated) }
}

export async function storeInvoiceReceipt(
  id: string,
  payload: {
    receiptHash: string
    txHash: string
    payerAddress: string
  },
) {
  if (!payload.receiptHash || !payload.txHash || !payload.payerAddress) {
    throw new PaymentFlowError(400, 'Missing receipt payload fields')
  }
  if (!isLikelyEvmAddress(payload.payerAddress)) {
    throw new PaymentFlowError(400, 'Invalid payer address')
  }

  const invoice = await requireInvoice(id)
  if (invoice.status !== 'paid') {
    throw new PaymentFlowError(409, 'Invoice must be paid before storing receipt')
  }

  const doc: ReceiptDoc = {
    invoiceId: invoice.invoiceId,
    txHash: payload.txHash,
    amount: invoice.amount,
    token: invoice.tokenSymbol,
    payerAddress: payload.payerAddress,
    issuerZkAddress: invoice.issuerAddress,
    receiptHash: payload.receiptHash,
    createdAt: nowIso(),
  }

  const savedId = await receiptDb.upsertByInvoiceId(invoice.invoiceId, doc)
  return { ok: true, id: savedId }
}
