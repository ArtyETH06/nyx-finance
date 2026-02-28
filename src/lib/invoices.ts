export type InvoiceStatus = 'sent' | 'accepted' | 'rejected' | 'paid'

export interface InvoicePartyInfo {
  firstName?: string
  lastName?: string
  company?: string
}

export interface Invoice {
  _id: string
  invoiceId: string
  issuerAddress: string
  payerAddress: string
  issuerInfo?: InvoicePartyInfo
  payerInfo?: InvoicePartyInfo
  title: string
  description: string
  amount: number
  currency: string
  status: InvoiceStatus
  rejectionReason: string | null
  pdfHash: string
  createdAt: string
  updatedAt?: string
  payment?: {
    relayId?: string
    txHash?: string
    paidAt?: string
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function makeInvoiceId(now = new Date()): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `NYX-${date}-${rand}`
}

export function fmtPartyName(info?: InvoicePartyInfo): string {
  const full = [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim()
  return full || info?.company || '—'
}
