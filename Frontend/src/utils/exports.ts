import { Customer, SaleInvoice, Supplier, BusinessSettings } from '../types';

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const bom = '\uFEFF';
  const csvContent =
    bom +
    [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      ),
    ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  let tableHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
          th { background-color: #00A859; color: #ffffff; font-weight: bold; padding: 8px 12px; border: 1px solid #dcdcdc; }
          td { padding: 6px 10px; border: 1px solid #e2e8f0; }
          .alt { background-color: #f8fafc; }
          .num { text-align: right; font-family: 'Courier New', monospace; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row, idx) =>
                  `<tr class="${idx % 2 === 1 ? 'alt' : ''}">` +
                  row
                    .map((cell) => {
                      const isNum = typeof cell === 'number' || (typeof cell === 'string' && cell.startsWith('$'));
                      return `<td class="${isNum ? 'num' : ''}">${String(cell ?? '')}</td>`;
                    })
                    .join('') +
                  '</tr>'
              )
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printHtmlDocument(title: string, bodyHtml: string) {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    alert('Please allow popups to print documents.');
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #0f172a; margin: 0; padding: 20px; }
          h1, h2, h3 { margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #f1f5f9; color: #475569; font-weight: bold; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .font-mono { font-family: monospace; }
          .bold { font-weight: bold; }
          .badge-paid { color: #059669; font-weight: bold; }
          .badge-debt { color: #e11d48; font-weight: bold; }
          .company-brand { display: flex; justify-content: center; margin-bottom: 12px; }
          .company-brand img { width: 88px; height: 88px; object-fit: contain; }
          .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 10px; text-align: center; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="company-brand">
          <img src="/assets/safisali-companies-wordmark.png" alt="Safi Sali Companies" />
        </div>
        ${bodyHtml}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function exportInvoicePDF(invoice: SaleInvoice, settings?: BusinessSettings) {
  const bodyHtml = `
    <div style="border-bottom: 3px solid #00A859; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between;">
      <div>
        <h1 style="color: #0f172a; font-size: 20px; font-weight: 800;">${settings?.businessName || 'Safi Sali Companies'}</h1>
        <div style="color: #64748b; font-size: 11px; margin-top: 4px;">${settings?.address || 'Mogadishu, Somalia'} · Tel: ${settings?.phone || '+252 61 3078734'}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 16px; font-weight: bold; color: #00A859;">OFFICIAL SALES INVOICE</div>
        <div style="font-family: monospace; font-size: 12px; color: #475569;">${invoice.invoiceNumber}</div>
        <div style="font-size: 11px; color: #94a3b8;">${invoice.date}</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px;">
      <div>
        <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: bold;">Billed To Customer</div>
        <div style="font-size: 13px; font-weight: bold;">${invoice.customerName}</div>
        <div style="color: #64748b;">${invoice.customerPhone || 'Walk-in'}</div>
      </div>
      <div style="text-align: right;">
        <div style="color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: bold;">Cashier / Terminal</div>
        <div style="font-size: 13px; font-weight: bold;">${invoice.cashierName}</div>
        <div style="color: #00A859; font-weight: bold; text-transform: uppercase;">Method: ${invoice.paymentMethod.replace('_', ' ')}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th style="text-align: center;">Qty</th>
          <th class="text-right">Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items
          .map(
            (it, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td class="bold">${it.productName} <span style="font-size: 9px; color: #94a3b8; font-family: monospace;">(${it.sku})</span></td>
            <td style="text-align: center;">${it.quantity} ${it.unit}</td>
            <td class="text-right font-mono">$${it.unitPrice.toFixed(2)}</td>
            <td class="text-right font-mono bold">$${it.total.toFixed(2)}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
      <div style="width: 260px;">
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #64748b;">Subtotal:</span>
          <span class="font-mono">$${invoice.subtotal.toFixed(2)}</span>
        </div>
        ${
          invoice.discount > 0
            ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #00A859;">
                <span>Discount:</span>
                <span class="font-mono">-$${invoice.discount.toFixed(2)}</span>
              </div>`
            : ''
        }
        ${
          invoice.tax > 0
            ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
                <span>Tax Amount:</span>
                <span class="font-mono">$${invoice.tax.toFixed(2)}</span>
              </div>`
            : ''
        }
        ${
          invoice.goodsInsurance && invoice.goodsInsurance > 0
            ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
                <span>Goods Insurance:</span>
                <span class="font-mono">$${invoice.goodsInsurance.toFixed(2)}</span>
              </div>`
            : ''
        }
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #e2e8f0; font-size: 14px; font-weight: bold;">
          <span>Grand Total:</span>
          <span class="font-mono" style="color: #00A859;">$${invoice.totalAmount.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
          <span>Paid Amount:</span>
          <span class="font-mono">$${invoice.paidAmount.toFixed(2)}</span>
        </div>
        ${
          invoice.outstandingBalance > 0
            ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e11d48; font-weight: bold; background: #fff1f2; padding: 4px 6px; border-radius: 4px;">
                <span>Outstanding Deyn:</span>
                <span class="font-mono">$${invoice.outstandingBalance.toFixed(2)}</span>
              </div>`
            : ''
        }
      </div>
    </div>

    <div class="footer">
      ${settings?.receiptFooter || 'Mahadsanid! Waad ku mahadsantahay doorashada Safi Sali Companies.'}<br/>
      Generated on ${new Date().toLocaleString()} · Safi Sali Companies
    </div>
  `;

  printHtmlDocument(`Invoice_${invoice.invoiceNumber}`, bodyHtml);
}

export function exportCustomerOutstandingDebtsPDF(customers: Customer[], settings?: BusinessSettings) {
  const debtors = customers.filter((c) => c.currentBalance > 0);
  const totalDue = debtors.reduce((s, c) => s + c.currentBalance, 0);

  const bodyHtml = `
    <div style="border-bottom: 3px solid #e11d48; padding-bottom: 12px; margin-bottom: 20px;">
      <h1 style="color: #0f172a; font-size: 20px; font-weight: 800;">${settings?.businessName || 'Safi Sali Companies'} - CUSTOMER OUTSTANDING DEBTS (DEYN)</h1>
      <div style="color: #64748b; font-size: 11px;">Official Accounts Receivable Audit Statement · Tel: ${settings?.phone || '+252 61 3078734'}</div>
    </div>

    <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between;">
      <div>
        <div style="color: #9f1239; font-weight: bold; font-size: 11px; text-transform: uppercase;">Total Active Debtors</div>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${debtors.length} Customers</div>
      </div>
      <div style="text-align: right;">
        <div style="color: #9f1239; font-weight: bold; font-size: 11px; text-transform: uppercase;">Total Receivables (Deyn)</div>
        <div style="font-size: 22px; font-weight: 900; color: #e11d48; font-family: monospace;">$${totalDue.toFixed(2)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Customer ID</th>
          <th>Debtor Name</th>
          <th>Phone</th>
          <th class="text-right">Total Credit</th>
          <th class="text-right">Total Paid</th>
          <th class="text-right" style="color: #e11d48;">Balance Due (Deyn)</th>
        </tr>
      </thead>
      <tbody>
        ${
          debtors.length === 0
            ? '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #059669;">No outstanding debts found! All customer accounts are fully settled.</td></tr>'
            : debtors
                .map(
                  (c, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td class="font-mono">${c.customerId}</td>
              <td class="bold">${c.name}</td>
              <td>${c.phone}</td>
              <td class="text-right font-mono">$${c.totalCredit.toFixed(2)}</td>
              <td class="text-right font-mono" style="color: #059669;">$${c.totalPayments.toFixed(2)}</td>
              <td class="text-right font-mono bold" style="color: #e11d48;">$${c.currentBalance.toFixed(2)}</td>
            </tr>
          `
                )
                .join('')
        }
      </tbody>
      <tfoot>
        <tr style="background: #0f172a; color: #ffffff;">
          <td colspan="4" class="bold" style="padding: 10px; color: #fff;">TOTAL RECEIVABLES OWED</td>
          <td class="text-right font-mono bold" style="color: #fff;">$${debtors.reduce((s, c) => s + c.totalCredit, 0).toFixed(2)}</td>
          <td class="text-right font-mono bold" style="color: #a7f3d0;">$${debtors.reduce((s, c) => s + c.totalPayments, 0).toFixed(2)}</td>
          <td class="text-right font-mono bold" style="color: #fecdd3;">$${totalDue.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      Generated on ${new Date().toLocaleString()} · Authorized Statement by Safi Sali Companies
    </div>
  `;

  printHtmlDocument('Customer_Outstanding_Debts_Report', bodyHtml);
}

export function exportSupplierDebtsPDF(suppliers: Supplier[], settings?: BusinessSettings) {
  const creditors = suppliers.filter((s) => s.currentBalance > 0);
  const totalPayables = creditors.reduce((s, c) => s + c.currentBalance, 0);

  const bodyHtml = `
    <div style="border-bottom: 3px solid #f59e0b; padding-bottom: 12px; margin-bottom: 20px;">
      <h1 style="color: #0f172a; font-size: 20px; font-weight: 800;">${settings?.businessName || 'Safi Sali Companies'} - SUPPLIER DEBTS (ACCOUNTS PAYABLE)</h1>
      <div style="color: #64748b; font-size: 11px;">Wholesale Accounts Payable & Vendor Balance Statement · Tel: ${settings?.phone || '+252 61 3078734'}</div>
    </div>

    <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between;">
      <div>
        <div style="color: #b45309; font-weight: bold; font-size: 11px; text-transform: uppercase;">Active Creditor Suppliers</div>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${creditors.length} Suppliers</div>
      </div>
      <div style="text-align: right;">
        <div style="color: #b45309; font-weight: bold; font-size: 11px; text-transform: uppercase;">Total Amount Owed to Suppliers</div>
        <div style="font-size: 22px; font-weight: 900; color: #d97706; font-family: monospace;">$${totalPayables.toFixed(2)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Supplier ID</th>
          <th>Supplier / Company</th>
          <th>Contact & Phone</th>
          <th class="text-right">Total Purchases</th>
          <th class="text-right">Paid to Date</th>
          <th class="text-right" style="color: #b45309;">Amount We Owe</th>
        </tr>
      </thead>
      <tbody>
        ${
          creditors.length === 0
            ? '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #059669;">No outstanding supplier debts! All vendor accounts are fully paid.</td></tr>'
            : creditors
                .map(
                  (s, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td class="font-mono">${s.supplierId}</td>
              <td class="bold">${s.name}</td>
              <td>${s.contactPerson} (${s.phone})</td>
              <td class="text-right font-mono">$${s.totalPurchases.toFixed(2)}</td>
              <td class="text-right font-mono" style="color: #059669;">$${s.totalPayments.toFixed(2)}</td>
              <td class="text-right font-mono bold" style="color: #b45309;">$${s.currentBalance.toFixed(2)}</td>
            </tr>
          `
                )
                .join('')
        }
      </tbody>
    </table>

    <div class="footer">
      Generated on ${new Date().toLocaleString()} · Authorized Statement by Safi Sali Companies
    </div>
  `;

  printHtmlDocument('Supplier_Debts_Report', bodyHtml);
}

export function exportCustomerProfilePDF(customer: Customer, settings?: BusinessSettings) {
  const bodyHtml = `
    <div style="border-bottom: 3px solid #00A859; padding-bottom: 12px; margin-bottom: 20px;">
      <h1 style="color: #0f172a; font-size: 20px; font-weight: 800;">${settings?.businessName || 'Safi Sali Companies'} - CUSTOMER STATEMENT</h1>
      <div style="color: #64748b; font-size: 11px;">Official Account Profile & Ledger Statement · Tel: ${settings?.phone || '+252 61 3078734'}</div>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${customer.name}</div>
      <div style="font-family: monospace; color: #00A859; font-weight: bold; margin-top: 2px;">ID: ${customer.customerId} · Tel: ${customer.phone}</div>
      <div style="color: #64748b; font-size: 11px; margin-top: 4px;">Address: ${customer.address || 'Mogadishu'} · Email: ${customer.email || '—'} · Registered: ${customer.createdAt}</div>
    </div>

    <div style="margin-bottom: 20px; color: #475569; font-size: 11px;">
      <strong>Credit Limit:</strong> $${(customer.creditLimit || 0).toFixed(2)}
      ${customer.notes ? `<div style="margin-top: 6px;"><strong>Notes:</strong> ${customer.notes}</div>` : ''}
    </div>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
      <div style="background: #f1f5f9; padding: 10px; border-radius: 6px;">
        <div style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">Opening Bal</div>
        <div style="font-size: 14px; font-weight: bold; font-family: monospace;">$${customer.openingBalance.toFixed(2)}</div>
      </div>
      <div style="background: #fff1f2; padding: 10px; border-radius: 6px;">
        <div style="font-size: 9px; color: #e11d48; font-weight: bold; text-transform: uppercase;">Total Credit</div>
        <div style="font-size: 14px; font-weight: bold; color: #e11d48; font-family: monospace;">$${customer.totalCredit.toFixed(2)}</div>
      </div>
      <div style="background: #ecfdf5; padding: 10px; border-radius: 6px;">
        <div style="font-size: 9px; color: #059669; font-weight: bold; text-transform: uppercase;">Total Paid</div>
        <div style="font-size: 14px; font-weight: bold; color: #059669; font-family: monospace;">$${customer.totalPayments.toFixed(2)}</div>
      </div>
      <div style="background: ${customer.currentBalance > 0 ? '#fff1f2' : '#f0fdf4'}; padding: 10px; border-radius: 6px;">
        <div style="font-size: 9px; color: ${customer.currentBalance > 0 ? '#e11d48' : '#059669'}; font-weight: bold; text-transform: uppercase;">Current Balance</div>
        <div style="font-size: 16px; font-weight: 900; color: ${customer.currentBalance > 0 ? '#e11d48' : '#059669'}; font-family: monospace;">$${customer.currentBalance.toFixed(2)}</div>
      </div>
    </div>

    <div class="footer">
      Generated on ${new Date().toLocaleString()} · Safi Sali Companies
    </div>
  `;

  printHtmlDocument(`Customer_${customer.customerId}_Statement`, bodyHtml);
}
