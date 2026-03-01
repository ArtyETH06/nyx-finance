export interface InvoiceEmailParams {
  invoiceId: string
  title: string
  issuerName: string
  issuerCompany?: string
  lineItems: Array<{ title: string; description?: string; quantity?: number; unitPrice?: number; amount: number }>
  total: number
  tokenSymbol: string
  issueDate: string
  dueDate: string
  payUrl: string
}

export function buildInvoiceEmailHtml(params: InvoiceEmailParams): string {
  const { invoiceId, title, issuerName, issuerCompany, lineItems, total, tokenSymbol, issueDate, dueDate, payUrl } = params

  const lineRows = lineItems.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111827;font-weight:600;">${item.title}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#6B7280;">${item.description ?? '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;text-align:right;white-space:nowrap;">
        ${item.quantity != null && item.unitPrice != null ? `${item.quantity} × ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111827;font-weight:700;text-align:right;white-space:nowrap;">
        ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tokenSymbol}
      </td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#070B1A;border-radius:12px 12px 0 0;padding:28px 36px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;">NYX</p>
          <p style="margin:4px 0 0;font-size:11px;color:#8C94B3;letter-spacing:0.06em;text-transform:uppercase;">Public Blockchain. Private Business.</p>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:32px 36px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.1em;text-transform:uppercase;">Invoice</p>
          <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0A0F1C;">${title}</h1>
          <p style="margin:0 0 28px;font-size:13px;color:#6B7280;">From <strong style="color:#374151;">${issuerName}${issuerCompany ? ` · ${issuerCompany}` : ''}</strong></p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="width:50%;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px 0 0 8px;">
                <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;">Invoice ID</p>
                <p style="margin:0;font-size:13px;color:#111827;font-family:monospace;">${invoiceId}</p>
              </td>
              <td style="width:50%;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-left:none;border-radius:0 8px 8px 0;">
                <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;">Due Date</p>
                <p style="margin:0;font-size:13px;color:#111827;">${dueDate}</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:16px;">
            <thead>
              <tr style="background:#F9FAFB;">
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E5E7EB;">Service</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E5E7EB;">Description</th>
                <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E5E7EB;">Qty × Unit</th>
                <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #E5E7EB;">Amount</th>
              </tr>
            </thead>
            <tbody>${lineRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="font-size:13px;color:#6B7280;">Issued ${issueDate}</td>
              <td style="text-align:right;">
                <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;margin-right:12px;">Total</span>
                <span style="font-size:20px;font-weight:700;color:#0A0F1C;">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $${tokenSymbol}</span>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${payUrl}" style="display:inline-block;padding:14px 40px;background:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:-0.2px;">
                Pay Invoice
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#F9FAFB;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9CA3AF;">This invoice was sent via <strong style="color:#6B7280;">NYX</strong> · Private on-chain settlement</p>
          <p style="margin:6px 0 0;font-size:11px;color:#9CA3AF;">If you didn't expect this email, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
