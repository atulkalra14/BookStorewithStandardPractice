// Seeded alice orders (test/data/bookstore-Orders.csv). Read-only use: do NOT call resetOrders() in files using these.
export const O_PLACED = 'd4000000-0000-4000-8000-000000000001' // ORD-2026-900001, Placed, delivered, 2 items, 33.98 EUR
export const O_NOT_DELIVERED = 'd4000000-0000-4000-8000-000000000004' // ORD-2026-900004, Placed, no deliveredAt, 1 item, 28.00
export const O_CANCELLED = 'd4000000-0000-4000-8000-000000000003' // ORD-2026-900003, Cancelled
export const NUM_PLACED = 'ORD-2026-900001'
export const ph = '/odata/v4/purchase-history'
export const invoiceUrl = id => `${ph}/Orders(${id})/PurchaseHistoryService.invoice()`
// Binary-safe GET (PDF); returns the raw Buffer in res.data.
export const GETbin = (t, url, u) => t.GET(url, { ...(u || {}), responseType: 'arraybuffer' })
export const asText = res => Buffer.from(res.data).toString('latin1')
export const INVOICE_KEYS = ['INVOICE_TITLE', 'INVOICE_NUMBER', 'INVOICE_SELLER', 'INVOICE_BILL_TO', 'INVOICE_DATE',
  'INVOICE_TOTAL_NET', 'INVOICE_NO_VAT_NOTE', 'ERR_INVOICE_NOT_AVAILABLE']
