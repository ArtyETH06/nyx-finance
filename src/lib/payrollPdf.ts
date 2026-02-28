import { jsPDF } from 'jspdf'
import SHA256 from 'crypto-js/sha256'
import CryptoJS from 'crypto-js'
import nyxLogo from '../images/logo.png'

export interface PayrollPdfInput {
  payrollId: string
  organizationName: string
  memberName?: string
  memberAddress: string
  amount: number
  currency: string
  schedule: string
  executedAt: string   // ISO string
  txHash?: string
  relayId?: string
}

const COLOR = {
  headerBg:    [5,   8,  20] as const,
  textDark:    [17,  24,  39] as const,
  textMuted:   [107, 114, 128] as const,
  lineLight:   [229, 231, 235] as const,
  confirmed:   [34,  197,  94] as const,
  accent:      [108,  92, 231] as const,
}

let cachedLogoPromise: Promise<string | null> | null = null
async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoPromise) return cachedLogoPromise
  cachedLogoPromise = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = nyxLogo
  })
  return cachedLogoPromise
}

function fmtAmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function scheduleLabel(s: string) {
  if (s === 'weekly')   return 'Weekly'
  if (s === 'biweekly') return 'Bi-weekly'
  return 'Monthly'
}

function fmtDatetime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
}

function label(doc: jsPDF, x: number, y: number, text: string) {
  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(text, x, y)
}

function value(doc: jsPDF, x: number, y: number, text: string, size = 10) {
  doc.setTextColor(...COLOR.textDark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  doc.text(text, x, y)
}

function divider(doc: jsPDF, left: number, right: number, y: number) {
  doc.setDrawColor(...COLOR.lineLight)
  doc.setLineWidth(0.5)
  doc.line(left, y, right, y)
}

export async function buildPayrollPdf(input: PayrollPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setProperties({
    title: `NYX Payroll ${input.payrollId}`,
    subject: 'Payroll Confirmation',
    creator: 'NYX',
    author: 'NYX',
    keywords: 'nyx,payroll,private,blockchain',
  })

  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const left = 44
  const right = pw - 44
  const valueX = left + 150

  // ── Dark header ──
  const headerH = 84
  doc.setFillColor(...COLOR.headerBg)
  doc.rect(0, 0, pw, headerH, 'F')

  const logo = await getLogoDataUrl()
  if (logo) {
    doc.addImage(logo, 'PNG', left, 18, 84, 28)
    doc.setTextColor(160, 170, 188)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Public blockchain. Private business.', left, 64)
  } else {
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('NYX', left, 40)
  }

  // CONFIRMED badge
  const bx = right - 110
  const by = headerH / 2
  doc.setFillColor(...COLOR.confirmed)
  doc.circle(bx, by, 4, 'F')
  doc.setTextColor(...COLOR.confirmed)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('CONFIRMED', bx + 10, by + 3)

  let y = headerH + 30

  // ── Title ──
  doc.setTextColor(...COLOR.textDark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('PAYROLL CONFIRMATION', left, y)
  y += 30

  divider(doc, left, right, y)
  y += 20

  // ── Payroll Info ──
  label(doc, left, y, 'PAYROLL INFORMATION')
  y += 16

  const rows: [string, string][] = [
    ['PAYROLL ID',      input.payrollId],
    ['EXECUTION DATE',  fmtDatetime(input.executedAt)],
    ['ORGANIZATION',    input.organizationName],
  ]
  for (const [lbl, val] of rows) {
    label(doc, left, y, lbl)
    value(doc, valueX, y, val)
    y += 16
  }

  y += 10
  divider(doc, left, right, y)
  y += 20

  // ── Employee ──
  label(doc, left, y, 'EMPLOYEE')
  y += 16

  if (input.memberName) {
    label(doc, left, y, 'NAME')
    value(doc, valueX, y, input.memberName)
    y += 16
  }

  label(doc, left, y, 'ZK ADDRESS')
  doc.setTextColor(...COLOR.textDark)
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  const addrLines = doc.splitTextToSize(input.memberAddress, right - valueX)
  doc.text(addrLines, valueX, y)
  y += addrLines.length * 10 + 6

  y += 6
  divider(doc, left, right, y)
  y += 20

  // ── Salary Details ──
  label(doc, left, y, 'SALARY DETAILS')
  y += 16

  const salaryRows: [string, string][] = [
    ['AMOUNT',    `${fmtAmt(input.amount)} ${input.currency}`],
    ['CURRENCY',  input.currency],
    ['SCHEDULE',  scheduleLabel(input.schedule)],
  ]
  for (const [lbl, val] of salaryRows) {
    label(doc, left, y, lbl)
    value(doc, valueX, y, val)
    y += 16
  }

  y += 10
  divider(doc, left, right, y)
  y += 20

  // ── Payment Proof ──
  label(doc, left, y, 'PAYMENT PROOF')
  y += 16

  if (input.txHash) {
    label(doc, left, y, 'TRANSACTION HASH')
    doc.setTextColor(...COLOR.accent)
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    const hashLines = doc.splitTextToSize(input.txHash, right - valueX)
    doc.text(hashLines, valueX, y)
    y += hashLines.length * 10 + 6
  }

  if (input.relayId) {
    label(doc, left, y, 'RELAY ID')
    doc.setTextColor(...COLOR.textDark)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    const relayLines = doc.splitTextToSize(input.relayId, right - valueX)
    doc.text(relayLines, valueX, y)
    y += relayLines.length * 10 + 6
  }

  // ── Footer ──
  const footerY = ph - 32
  divider(doc, left, right, footerY)
  doc.setTextColor(...COLOR.textMuted)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('NYX - Public Blockchain. Private Business', pw / 2, (footerY + ph) / 2 + 2, { align: 'center' })

  return doc
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const wa = CryptoJS.lib.WordArray.create(buf)
  return SHA256(wa).toString()
}

export function downloadPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
