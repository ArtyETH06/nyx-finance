import { jsPDF } from 'jspdf'
import SHA256 from 'crypto-js/sha256'
import CryptoJS from 'crypto-js'

import type { InvoicePartyInfo } from './invoices'

interface InvoicePdfInput {
  invoiceId: string
  issueDate: string
  issuerAddress: string
  issuerInfo?: InvoicePartyInfo
  payerAddress: string
  payerInfo?: InvoicePartyInfo
  title: string
  description: string
  amount: number
  tokenSymbol: string
  statusText?: string
}

function partyLine(info: InvoicePartyInfo | undefined, address: string): string[] {
  const full = [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim()
  const out: string[] = []
  if (full) out.push(full)
  if (info?.company) out.push(info.company)
  out.push(address)
  return out
}

export function buildInvoicePdf(input: InvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setCreationDate(new Date(`${input.issueDate}T00:00:00.000Z`))
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 44
  const right = pageWidth - 44

  doc.setFillColor(14, 20, 40)
  doc.rect(0, 0, pageWidth, 106, 'F')

  doc.setTextColor(230, 233, 242)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('NYX', left, 44)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Private Finance on Monad', left, 62)
  doc.text(`Issue Date: ${input.issueDate}`, right, 44, { align: 'right' })
  doc.text(`Status: ${input.statusText ?? 'SENT'}`, right, 62, { align: 'right' })

  doc.setTextColor(17, 26, 53)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`Invoice ${input.invoiceId}`, left, 140)

  let y = 170
  const labelCol = left
  const valueCol = left + 150
  const lineGap = 18

  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(label, labelCol, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '—', valueCol, y)
    y += lineGap
  }

  row('Title', input.title)
  row('Description', input.description)
  row('Amount', `${input.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${input.tokenSymbol}`)
  row('Token', input.tokenSymbol)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.text('Issuer Info', left, y)
  y += 16
  for (const line of partyLine(input.issuerInfo, input.issuerAddress)) {
    doc.setFont('helvetica', 'normal')
    doc.text(line, left, y)
    y += 14
  }

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.text('Payer Info', left, y)
  y += 16
  for (const line of partyLine(input.payerInfo, input.payerAddress)) {
    doc.setFont('helvetica', 'normal')
    doc.text(line, left, y)
    y += 14
  }

  return doc
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const wordArray = CryptoJS.lib.WordArray.create(buf)
  return SHA256(wordArray).toString()
}

export function downloadPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
