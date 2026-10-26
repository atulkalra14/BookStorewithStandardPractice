import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { renderInvoice } from './invoice-pdf.js'

const FALLBACK = 'en'

// Languages that have their own messages bundle in _i18n/, read once. A new language needs only new files.
const LANGUAGES = new Set(fs.readdirSync(path.join(cds.root, '_i18n'))
  .map(f => /^messages_([a-z]{2,3})\.properties$/.exec(f)?.[1]).filter(Boolean))

function languageOf (locale) {
  const lang = String(locale || FALLBACK).split(/[-_]/)[0].toLowerCase()
  return LANGUAGES.has(lang) ? lang : FALLBACK
}

const money = (value, currency, lang) =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'EUR' }).format(Number(value))

const day = (value, lang) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))

// Plain text of the invoice, one entry per printed line; the PDF prints exactly these lines (labels from messages*.properties).
export function invoiceLines (order, items, store, locale) {
  const lang = languageOf(locale)
  const t = key => cds.i18n.messages.at(key, lang)
  const cur = order.currency
  return [
    t('INVOICE_TITLE'),
    `${t('INVOICE_NUMBER')}: INV-${order.orderNumber}`,
    `${t('INVOICE_DATE')}: ${day(order.placedAt, lang)}`,
    t('INVOICE_SELLER'),
    store?.name, store?.address,
    t('INVOICE_BILL_TO'),
    order.shipToName, order.shipToStreet, `${order.shipToZip} ${order.shipToCity}`, order.shipToCountry_code ?? order.shipToCountry,
    [t('INVOICE_COL_QTY'), t('INVOICE_COL_ITEM'), t('INVOICE_COL_UNIT_PRICE'), t('INVOICE_COL_TOTAL')].join(' | '),
    ...items.map(i => [i.quantity, i.bookTitle, money(i.unitPrice, cur, lang), money(i.lineTotal, cur, lang)].join(' | ')),
    `${t('INVOICE_TOTAL_NET')}: ${money(order.totalAmount, cur, lang)}`,
    t('INVOICE_NO_VAT_NOTE')
  ].filter(l => l != null && l !== '')
}

// Display data for the PDF: same texts and formats as invoiceLines, grouped for the layout in invoice-pdf.js.
function invoiceView (order, items, store, locale) {
  const lang = languageOf(locale)
  const t = (key, args) => cds.i18n.messages.at(key, lang, args)
  const cur = order.currency
  const number = `INV-${order.orderNumber}`
  return {
    number,
    title: t('INVOICE_TITLE'),
    store: { name: store?.name, address: store?.address },
    seller: [store?.name, store?.address, store?.phone].filter(Boolean),
    billTo: [order.shipToName, order.shipToStreet, `${order.shipToZip} ${order.shipToCity}`, order.shipToCountry_code ?? order.shipToCountry].filter(Boolean),
    meta: [
      [t('INVOICE_NUMBER'), number],
      [t('INVOICE_DATE'), day(order.placedAt, lang)],
      [t('INVOICE_ORDER_NO'), order.orderNumber],
      ...(order.deliveredAt ? [[t('INVOICE_DELIVERY_DATE'), day(order.deliveredAt, lang)]] : [])
    ],
    labels: {
      billTo: t('INVOICE_BILL_TO'), seller: t('INVOICE_SELLER'), pos: t('INVOICE_COL_POS'), item: t('INVOICE_COL_ITEM'),
      qty: t('INVOICE_COL_QTY'), unit: t('INVOICE_COL_UNIT_PRICE'), amount: t('INVOICE_COL_TOTAL'),
      total: t('INVOICE_TOTAL_NET'), noVat: t('INVOICE_NO_VAT_NOTE'), thanks: t('INVOICE_THANK_YOU')
    },
    rows: items.map((i, n) => ({ pos: String(n + 1), item: i.bookTitle, qty: String(i.quantity), unit: money(i.unitPrice, cur, lang), amount: money(i.lineTotal, cur, lang) })),
    totalText: money(order.totalAmount, cur, lang),
    footer: [store?.address, store?.phone].filter(Boolean),
    pageText: (n, count) => t('INVOICE_PAGE', [n, count])
  }
}

export function buildInvoice (order, items, store, locale) {
  return renderInvoice(invoiceView(order, items, store, locale))
}

// Bound function Orders.invoice(). Must always read through srv (never cds.db): the READ rule on Orders is the only
// row filter, so another customer's order gives 404.
export async function invoiceFor (srv, req) {
  const { Orders, Items } = srv.entities
  const ID = req.params.at(-1)?.ID ?? req.params.at(-1)
  const order = await srv.run(SELECT.one.from(Orders).where({ ID }))
  if (!order) return req.reject(404)
  if (order.status !== 'Placed') return req.reject(400, 'ERR_INVOICE_NOT_AVAILABLE')
  const items = await srv.run(SELECT.from(Items).where({ order_ID: ID }).orderBy('bookTitle'))
  // Seller data is shop-wide, not customer data, and is not part of this service: read with the db service.
  const store = await SELECT.one.from('bookstore.StoreInfo').columns('name', 'address', 'phone').orderBy('createdAt')
  const pdf = await buildInvoice(order, items, store, req.locale)
  const stream = Readable.from([pdf])
  return Object.assign(stream, { mimetype: 'application/pdf', filename: `INV-${order.orderNumber}.pdf` })
}
