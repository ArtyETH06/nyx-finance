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
  tokenAddress: string
  tokenSymbol: string
  currencySymbol: string
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

export function normalizeInvoiceRecord(raw: Record<string, unknown>): Invoice {
  const legacyCurrency = String(raw.currencySymbol ?? raw.tokenSymbol ?? raw.currency ?? 'USDCm')
  let tokenAddress = typeof raw.tokenAddress === 'string' ? raw.tokenAddress : ''
  let tokenSymbol = typeof raw.tokenSymbol === 'string' ? raw.tokenSymbol : legacyCurrency

  if (!tokenAddress) {
    if (legacyCurrency === 'USDTm') {
      tokenAddress = '0x86b6341d3c56bc379697d247fc080f5f2c8eed7b'
      tokenSymbol = 'USDTm'
    } else if (legacyCurrency === 'MON') {
      tokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      tokenSymbol = 'MON'
    } else if (legacyCurrency === 'UNLKm') {
      tokenAddress = '0xaaa4e95d4da878baf8e10745fdf26e196918df6b'
      tokenSymbol = 'UNLKm'
    } else {
      tokenAddress = '0xc4fb617e4e4cfbdeb07216dff62b4e46a2d6fdf6'
      tokenSymbol = 'USDCm'
    }
  }

  return {
    _id: String(raw._id ?? ''),
    invoiceId: String(raw.invoiceId ?? raw._id ?? ''),
    issuerAddress: String(raw.issuerAddress ?? ''),
    payerAddress: String(raw.payerAddress ?? ''),
    issuerInfo: (raw.issuerInfo as Invoice['issuerInfo']) ?? undefined,
    payerInfo: (raw.payerInfo as Invoice['payerInfo']) ?? undefined,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    amount: Number(raw.amount ?? 0),
    tokenAddress,
    tokenSymbol,
    currencySymbol: typeof raw.currencySymbol === 'string' ? raw.currencySymbol : tokenSymbol,
    status: (raw.status as Invoice['status']) ?? 'sent',
    rejectionReason: (raw.rejectionReason as string | null) ?? null,
    pdfHash: String(raw.pdfHash ?? ''),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    payment: (raw.payment as Invoice['payment']) ?? undefined,
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

export function formatIssueDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  if (status === 'rejected') return 'Rejected'
  if (status === 'paid') return 'Paid'
  return 'Pending'
}

export function invoiceStatusPdfText(status: InvoiceStatus): string {
  if (status === 'rejected') return 'REJECTED'
  if (status === 'paid') return 'PAID'
  return 'PENDING'
}
