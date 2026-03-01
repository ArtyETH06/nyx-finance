import { jsPDF } from 'jspdf'
import SHA256 from 'crypto-js/sha256'
import CryptoJS from 'crypto-js'

import nyxLogo from '../images/logo.png'
import type { InvoiceLineItem, InvoicePartyInfo, InvoiceStatus } from './invoices'

interface InvoicePdfInput {
  invoiceId: string
  title?: string
  issueDate: string
  dueDate: string
  issuerAddress: string
  issuerInfo?: InvoicePartyInfo
  payerAddress: string
  payerInfo?: InvoicePartyInfo
  lineItems: InvoiceLineItem[]
  tokenSymbol: string
  status: InvoiceStatus
  payment?: {
    relayId?: string
    txHash?: string
    paidAt?: string
  }
  nullifiers?: string[]
}

const COLOR = {
  headerBg: [5, 8, 20] as const,
  textDark: [17, 24, 39] as const,
  textMuted: [107, 114, 128] as const,
  lineLight: [229, 231, 235] as const,
  rowHeaderBg: [243, 244, 246] as const,
  statusPending: [245, 158, 11] as const,
  statusPaid: [34, 197, 94] as const,
  statusRejected: [239, 68, 68] as const,
}

let cachedLogoDataUrlPromise: Promise<string | null> | null = null

function fmtAmount(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTokenSymbol(symbol: string): string {
  const trimmed = (symbol ?? '').trim()
  if (!trimmed) return '$TOKEN'
  return trimmed.startsWith('$') ? trimmed : `$${trimmed}`
}

function fullName(info?: InvoicePartyInfo): string {
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ').trim()
  return name || '—'
}

function statusForPdf(status: InvoiceStatus): 'pending' | 'paid' | 'rejected' {
  if (status === 'paid') return 'paid'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

function statusBadgeMeta(status: ReturnType<typeof statusForPdf>) {
  if (status === 'paid') return { label: 'PAID', color: COLOR.statusPaid }
  if (status === 'rejected') return { label: 'REJECTED', color: COLOR.statusRejected }
  return { label: 'PENDING', color: COLOR.statusPending }
}

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrlPromise) return cachedLogoDataUrlPromise
  cachedLogoDataUrlPromise = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = nyxLogo
  })
  return cachedLogoDataUrlPromise
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, text: string) {
  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(text, x, y)
}

function drawInfoRow(doc: jsPDF, xLabel: number, xValue: number, y: number, label: string, value: string) {
  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(label, xLabel, y)

  doc.setTextColor(...COLOR.textDark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(value, xValue, y)
}

function drawPartyBlock(doc: jsPDF, x: number, y: number, title: string, info: InvoicePartyInfo | undefined, address: string): number {
  drawSectionTitle(doc, x, y, title)
  let cursorY = y + 14

  doc.setTextColor(...COLOR.textDark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(fullName(info), x, cursorY)
  cursorY += 14

  if (info?.company) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(info.company, x, cursorY)
    cursorY += 13
  }

  if (address && address.trim()) {
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    const wrappedAddress = doc.splitTextToSize(address, 245)
    doc.text(wrappedAddress, x, cursorY)
    cursorY += wrappedAddress.length * 10
  }

  return cursorY
}

function drawServicesHeader(doc: jsPDF, left: number, right: number, y: number, amountLabel: string) {
  const colService = 120
  const colAmount = 120
  const colDescription = (right - left) - colService - colAmount

  doc.setFillColor(...COLOR.rowHeaderBg)
  doc.rect(left, y, right - left, 24, 'F')

  doc.setDrawColor(...COLOR.lineLight)
  doc.setLineWidth(0.6)
  doc.line(left, y, right, y)
  doc.line(left, y + 24, right, y + 24)
  doc.line(left, y, left, y + 24)
  doc.line(left + colService, y, left + colService, y + 24)
  doc.line(left + colService + colDescription, y, left + colService + colDescription, y + 24)
  doc.line(right, y, right, y + 24)

  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('SERVICE', left + 8, y + 15)
  doc.text('DESCRIPTION', left + colService + 8, y + 15)
  doc.text(amountLabel, right - 8, y + 15, { align: 'right' })
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setCreationDate(new Date(`${input.issueDate}T00:00:00.000Z`))
  doc.setProperties({
    title: `NYX Invoice ${input.invoiceId}`,
    subject: 'Invoice',
    creator: 'NYX',
    author: 'NYX',
    keywords: 'nyx,invoice,private,blockchain',
  })
  const docAny = doc as unknown as { setFileId?: (id: string) => void }
  if (typeof docAny.setFileId === 'function') {
    docAny.setFileId(SHA256(input.invoiceId).toString().slice(0, 32))
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 44
  const right = pageWidth - 44
  const tokenSymbol = fmtTokenSymbol(input.tokenSymbol)

  const headerHeight = 84
  doc.setFillColor(...COLOR.headerBg)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')

  const logoDataUrl = await getLogoDataUrl()
  if (logoDataUrl) {
    const logoWidth = 84
    const logoHeight = 28
    const logoY = 18
    doc.addImage(logoDataUrl, 'PNG', left, logoY, logoWidth, logoHeight)

    doc.setTextColor(160, 170, 188)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Public blockchain. Private business.', left, logoY + logoHeight + 14)
  } else {
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('NYX', left, 40)
    doc.setTextColor(160, 170, 188)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Public blockchain. Private business.', left, 56)
  }

  const badge = statusBadgeMeta(statusForPdf(input.status))
  const badgeY = headerHeight / 2
  const badgeCircleX = right - 130
  doc.setFillColor(badge.color[0], badge.color[1], badge.color[2])
  doc.circle(badgeCircleX, badgeY, 4, 'F')
  doc.setTextColor(badge.color[0], badge.color[1], badge.color[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(badge.label, badgeCircleX + 10, badgeY + 3)

  let y = headerHeight + 28

  drawSectionTitle(doc, left, y, 'CONTRACT INFORMATION')
  y += 16
  const valueX = left + 130
  drawInfoRow(doc, left, valueX, y, 'INVOICE ID', input.invoiceId)
  y += 16
  if (input.title && input.title.trim()) {
    doc.setTextColor(...COLOR.textMuted)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('CONTRACT TITLE', left, y)

    doc.setTextColor(...COLOR.textDark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const titleLines = doc.splitTextToSize(input.title.trim(), right - valueX)
    doc.text(titleLines, valueX, y)
    y += Math.max(16, titleLines.length * 11)
  }
  drawInfoRow(doc, left, valueX, y, 'ISSUE DATE', input.issueDate)
  y += 16
  drawInfoRow(doc, left, valueX, y, 'DUE DATE', input.dueDate)
  y += 26

  const issuerBottom = drawPartyBlock(doc, left, y, 'ISSUER', input.issuerInfo, input.issuerAddress)
  const payerBottom = drawPartyBlock(doc, left + 260, y, 'PAYER', input.payerInfo, input.payerAddress)
  y = Math.max(issuerBottom, payerBottom) + 20

  drawSectionTitle(doc, left, y, 'SERVICES')
  y += 12

  const amountColumnLabel = `AMOUNT (${tokenSymbol})`
  drawServicesHeader(doc, left, right, y, amountColumnLabel)
  y += 24

  const colService = 120
  const colAmount = 120
  const colDescription = (right - left) - colService - colAmount

  const drawServicesHeaderWithSection = () => {
    drawSectionTitle(doc, left, 64, 'SERVICES')
    drawServicesHeader(doc, left, right, 76, amountColumnLabel)
    return 100
  }

  doc.setDrawColor(...COLOR.lineLight)
  doc.setLineWidth(0.6)

  for (const item of input.lineItems) {
    const titleLines = doc.splitTextToSize(item.title || 'Service', colService - 16)
    const descriptionLines = doc.splitTextToSize(item.description || '—', colDescription - 16)
    const amountText = `${fmtAmount(item.amount)} ${tokenSymbol}`

    const lines = Math.max(titleLines.length, descriptionLines.length, 1)
    const rowHeight = Math.max(28, (lines * 12) + 12)

    if (y + rowHeight + 100 > pageHeight) {
      doc.addPage()
      y = drawServicesHeaderWithSection()
    }

    doc.line(left, y, right, y)
    doc.line(left, y + rowHeight, right, y + rowHeight)
    doc.line(left, y, left, y + rowHeight)
    doc.line(left + colService, y, left + colService, y + rowHeight)
    doc.line(left + colService + colDescription, y, left + colService + colDescription, y + rowHeight)
    doc.line(right, y, right, y + rowHeight)

    doc.setTextColor(...COLOR.textDark)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(titleLines, left + 8, y + 16)

    doc.setFont('helvetica', 'normal')
    doc.text(descriptionLines, left + colService + 8, y + 16)

    doc.setFont('helvetica', 'bold')
    doc.text(amountText, right - 8, y + 16, { align: 'right' })

    y += rowHeight
  }

  const total = input.lineItems.reduce((acc, item) => acc + item.amount, 0)
  y += 14

  if (y + 80 > pageHeight - 48) {
    doc.addPage()
    y = 84
  }

  doc.setDrawColor(...COLOR.textDark)
  doc.setLineWidth(0.8)
  doc.line(left, y, right, y)
  y += 20

  doc.setTextColor(...COLOR.textDark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL', left, y)
  doc.text(`${fmtAmount(total)} ${tokenSymbol}`, right, y, { align: 'right' })

  // ── Payment Proof (only on paid invoices) ──────────────────────────────────
  if (input.status === 'paid' && (input.payment?.txHash || input.payment?.relayId)) {
    y += 28

    if (y + 80 > pageHeight - 48) {
      doc.addPage()
      y = 84
    }

    doc.setDrawColor(...COLOR.lineLight)
    doc.setLineWidth(0.5)
    doc.line(left, y, right, y)
    y += 16

    drawSectionTitle(doc, left, y, 'PAYMENT PROOF')
    y += 14

    const labelX = left
    const proofValueX = left + 100

    if (input.payment.paidAt) {
      const paidDate = new Date(input.payment.paidAt).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
      doc.setTextColor(...COLOR.textMuted)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('PAID AT', labelX, y)
      doc.setTextColor(...COLOR.textDark)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(paidDate, proofValueX, y)
      y += 14
    }

    if (input.payment.relayId) {
      doc.setTextColor(...COLOR.textMuted)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('RELAY ID', labelX, y)
      doc.setTextColor(...COLOR.textDark)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      const relayLines = doc.splitTextToSize(input.payment.relayId, right - proofValueX)
      doc.text(relayLines, proofValueX, y)
      y += relayLines.length * 10 + 4
    }

    if (input.payment.txHash) {
      doc.setTextColor(...COLOR.textMuted)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('TX HASH', labelX, y)
      doc.setTextColor(34, 197, 94)
      doc.setFont('courier', 'normal')
      doc.setFontSize(7.5)
      const hashLines = doc.splitTextToSize(input.payment.txHash, right - proofValueX)
      doc.text(hashLines, proofValueX, y)
      y += hashLines.length * 10 + 4

      doc.setTextColor(...COLOR.textMuted)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.text(`Verify: https://testnet.monadexplorer.com/tx/${input.payment.txHash}`, labelX, y)
      y += 12
    }

    if (input.nullifiers && input.nullifiers.length > 0) {
      if (y + input.nullifiers.length * 12 + 20 > pageHeight - 48) {
        doc.addPage()
        y = 84
      }

      doc.setTextColor(...COLOR.textMuted)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('NOTE NULLIFIERS', labelX, y)
      y += 12

      for (const nullifier of input.nullifiers) {
        doc.setTextColor(239, 68, 68)  // red — spent/nullified
        doc.setFont('courier', 'normal')
        doc.setFontSize(7)
        const nullLines = doc.splitTextToSize(nullifier, right - labelX - 10)
        doc.text(nullLines, labelX + 10, y)
        y += nullLines.length * 9 + 3
      }
    }
  }

  const footerLineY = pageHeight - 32
  const footerTextY = (footerLineY + pageHeight) / 2 + 2
  doc.setDrawColor(...COLOR.lineLight)
  doc.setLineWidth(0.7)
  doc.line(left, footerLineY, right, footerLineY)

  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('NYX - Public Blockchain. Private Business', pageWidth / 2, footerTextY, { align: 'center' })

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
