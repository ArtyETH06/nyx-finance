import { randomUUID } from 'crypto'
import { db, receiptDb, toPublicInvoice, type InvoiceDoc, type ReceiptDoc } from '../db.js'
import {
  buildDepositForPayer,
  confirmDepositRelay,
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

function shortHex(value?: string | null, head = 10, tail = 6): string {
  if (!value) return '(none)'
  if (value.length <= head + tail) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function isLikelyEvmContractAddress(value?: string): boolean {
  if (!value) return false
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isLikelyHexCalldata(value?: string): boolean {
  if (!value) return false
  return /^0x[0-9a-fA-F]+$/.test(value) && value.length > 2
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
    const reusable =
      lock.payerAddress.toLowerCase() === payerAddress.toLowerCase() &&
      !!lock.depositRelayId &&
      isLikelyEvmContractAddress(lock.depositTo) &&
      isLikelyHexCalldata(lock.depositCalldata)
    if (reusable) {
      console.log('[payment/start] reusing existing lock', {
        invoiceId: invoice.invoiceId,
        lockId: lock.lockId,
        payerAddress,
        depositTo: shortHex(lock.depositTo),
        calldataBytes: lock.depositCalldata ? Math.max(0, (lock.depositCalldata.length - 2) / 2) : 0,
      })
      return {
        invoice: toPublicInvoice(invoice),
        lockId: lock.lockId,
        deposit: {
          relayId: lock.depositRelayId,
          to: lock.depositTo,
          calldata: lock.depositCalldata,
          value: lock.depositValue ?? '0',
        },
      }
    }
    console.warn('[payment/start] replacing active lock to allow retry', {
      invoiceId: invoice.invoiceId,
      previousLockId: lock.lockId,
      previousPayerAddress: lock.payerAddress,
      requestedPayerAddress: payerAddress,
      depositTo: shortHex(lock.depositTo),
      calldataSample: shortHex(lock.depositCalldata),
    })
    await db.patchById(id, { paymentLock: null })
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
    const deposit = await buildDepositForPayer({
      depositor: payerAddress,
      token: locked.tokenAddress,
      amount,
      recipientZkAddress: locked.issuerAddress?.startsWith('unlink1')
        ? locked.issuerAddress
        : undefined,
    })

    updated = await db.patchById(id, {
      paymentLock: {
        ...pendingLock,
        depositRelayId: deposit.relayId,
        depositTo: deposit.to,
        depositCalldata: deposit.calldata,
        depositValue: deposit.value.toString(),
      },
    })
    if (!updated) throw new PaymentFlowError(500, 'Failed to persist payment lock')
    console.log('[payment/start] created lock and deposit payload', {
      invoiceId: locked.invoiceId,
      lockId,
      payerAddress,
      token: locked.tokenSymbol,
      amount: locked.amount,
      depositTo: shortHex(deposit.to),
      calldataBytes: Math.max(0, (deposit.calldata.length - 2) / 2),
      depositValue: deposit.value.toString(),
      recipientZkAddress: shortHex(locked.issuerAddress),
    })
  } catch (err) {
    console.error('[payment/start] failed to build deposit payload', {
      invoiceId: locked.invoiceId,
      lockId,
      payerAddress,
      token: locked.tokenSymbol,
      amount: locked.amount,
      error: err instanceof Error ? err.message : String(err),
    })
    await db.patchById(id, { paymentLock: null })
    throw err
  }

  return {
    invoice: toPublicInvoice(updated),
    lockId,
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

  console.log('[payment/confirm] confirming lock', {
    invoiceId: invoice.invoiceId,
    lockId: lock.lockId,
    payerAddress: payload.payerAddress,
    depositRelayId: lock.depositRelayId,
    depositTxHash: payload.depositTxHash,
    token: invoice.tokenSymbol,
    amount: invoice.amount,
    recipientZkAddress: shortHex(invoice.issuerAddress),
  })
  let settlement: Awaited<ReturnType<typeof confirmDepositRelay>>
  try {
    settlement = await confirmDepositRelay({
      depositRelayId: lock.depositRelayId,
    })
  } catch (err) {
    console.error('[payment/confirm] settlement failed, clearing lock for retry', {
      invoiceId: invoice.invoiceId,
      lockId: lock.lockId,
      payerAddress: payload.payerAddress,
      depositRelayId: lock.depositRelayId,
      error: err instanceof Error ? err.message : String(err),
    })
    await db.patchById(id, { paymentLock: null })
    throw err
  }

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
  console.log('[payment/confirm] invoice marked paid', {
    invoiceId: invoice.invoiceId,
    relayId: settlement.relayId,
    txHash: settlement.txHash ?? payload.depositTxHash,
  })
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
