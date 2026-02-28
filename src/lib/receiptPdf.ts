import { jsPDF } from 'jspdf'
import nyxLogo from '../images/logo.png'

export interface ReceiptPdfInput {
  invoiceId: string
  amount: number
  token: string
  payerAddress: string
  issuerZkAddress: string
  txHash: string
  timestampIso: string
}

let cachedLogoDataUrlPromise: Promise<string | null> | null = null

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

export async function buildPaymentReceiptPdf(input: ReceiptPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setCreationDate(new Date(input.timestampIso))
  doc.setProperties({
    title: `NYX Receipt ${input.invoiceId}`,
    subject: 'Payment Receipt',
    creator: 'NYX',
    author: 'NYX',
    keywords: 'nyx,receipt,payment,invoice',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 44

  doc.setFillColor(5, 8, 20)
  doc.rect(0, 0, pageWidth, 84, 'F')

  const logoData = await getLogoDataUrl()
  if (logoData) {
    doc.addImage(logoData, 'PNG', left, 18, 84, 28)
  } else {
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('NYX', left, 40)
  }

  doc.setTextColor(34, 197, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('STATUS: CONFIRMED', pageWidth - 44, 42, { align: 'right' })

  let y = 128
  const rows: Array<[string, string]> = [
    ['Invoice ID', input.invoiceId],
    ['Amount', `${input.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${input.token}`],
    ['From', input.payerAddress],
    ['To', input.issuerZkAddress],
    ['Transaction Hash', input.txHash],
    ['Timestamp', new Date(input.timestampIso).toLocaleString()],
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text('PAYMENT RECEIPT', left, y - 16)

  for (const [label, value] of rows) {
    doc.setTextColor(107, 114, 128)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label.toUpperCase(), left, y)

    doc.setTextColor(17, 24, 39)
    doc.setFont(label.includes('Hash') || label === 'From' || label === 'To' ? 'courier' : 'helvetica', 'normal')
    doc.setFontSize(9)
    const wrapped = doc.splitTextToSize(value, 470)
    doc.text(wrapped, left + 110, y)
    y += Math.max(20, wrapped.length * 12)
  }

  return doc.output('blob')
}
