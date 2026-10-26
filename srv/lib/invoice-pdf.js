import PDFDocument from 'pdfkit'

// Drawing of the invoice page(s). All texts and formatted values arrive ready-made from invoice.js (`d`), so this file
// holds layout only: A4, logo and header, parties, item table, totals, footer with page numbers.
const INK = '#1f2933'
const MUTED = '#6b7785'
const BRAND = '#0a4d68'
const BRAND_LIGHT = '#e8f1f5'
const RULE = '#cfd8de'
const M = 50                       // page margin
const W = 595.28 - 2 * M           // content width
const FOOTER_TOP = 842 - 78        // content must end above this line

// Open-book mark on a rounded square; drawn with vector paths so no image file is needed.
function logo (doc, x, y, size) {
  const s = size / 40
  doc.save().translate(x, y).scale(s)
  doc.roundedRect(0, 0, 40, 40, 8).fill(BRAND)
  doc.lineWidth(2.2).strokeColor('#ffffff').fillColor('#ffffff')
  doc.path('M20 12 C15 9 10 9 7 10 L7 29 C10 28 15 28 20 31 Z').fillOpacity(0.18).fill('#ffffff').fillOpacity(1)
  doc.path('M20 12 C25 9 30 9 33 10 L33 29 C30 28 25 28 20 31 Z').fillOpacity(0.18).fill('#ffffff').fillOpacity(1)
  doc.path('M20 12 C15 9 10 9 7 10 L7 29 C10 28 15 28 20 31 C25 28 30 28 33 29 L33 10 C30 9 25 9 20 12 Z M20 12 L20 31').stroke()
  doc.restore()
}

function header (doc, d) {
  logo(doc, M, M, 44)
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(17).text(d.store.name || '', M + 56, M + 4, { width: 260 })
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(d.store.address || '', M + 56, doc.y + 1, { width: 260 })
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(26).text(d.title.toUpperCase(), M, M, { width: W, align: 'right' })
  doc.moveTo(M, M + 62).lineTo(M + W, M + 62).lineWidth(1.5).strokeColor(BRAND).stroke()
}

function parties (doc, d, top) {
  const block = (x, colW, label, lines) => {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, top, { width: colW, characterSpacing: 0.6 })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(lines[0] || '', x, top + 14, { width: colW })
    doc.font('Helvetica').fontSize(10).text(lines.slice(1).join('\n'), x, doc.y + 1, { width: colW, lineGap: 1.5 })
  }
  block(M, 150, d.labels.billTo, d.billTo)
  block(M + 165, 120, d.labels.seller, d.seller)

  // Meta box on the right.
  const bx = M + W - 205
  const rows = d.meta
  const bh = 14 + rows.length * 17
  doc.roundedRect(bx, top - 4, 205, bh, 4).fill(BRAND_LIGHT)
  rows.forEach(([k, v], n) => {
    const y = top + 5 + n * 17
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(k, bx + 10, y, { width: 65 })
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text(v, bx + 78, y, { width: 117, align: 'right' })
  })
  return Math.max(doc.y, top - 4 + bh)
}

const COLS = (() => {
  const pos = 38, qty = 54, unit = 85, amount = 90
  const item = W - pos - qty - unit - amount
  return [
    { key: 'pos', x: M, w: pos, align: 'left' },
    { key: 'item', x: M + pos, w: item, align: 'left' },
    { key: 'qty', x: M + pos + item, w: qty, align: 'right' },
    { key: 'unit', x: M + pos + item + qty, w: unit, align: 'right' },
    { key: 'amount', x: M + pos + item + qty + unit, w: amount, align: 'right' }
  ]
})()

function tableHeader (doc, d, y) {
  doc.rect(M, y, W, 22).fill(BRAND)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
  const head = { pos: d.labels.pos, item: d.labels.item, qty: d.labels.qty, unit: d.labels.unit, amount: d.labels.amount }
  for (const c of COLS) doc.text(head[c.key], c.x + 6, y + 7, { width: c.w - 12, align: c.align })
  return y + 22
}

function table (doc, d, top) {
  let y = tableHeader(doc, d, top)
  d.rows.forEach((r, n) => {
    const h = Math.max(24, doc.font('Helvetica').fontSize(10).heightOfString(r.item, { width: COLS[1].w - 12 }) + 14)
    if (y + h > FOOTER_TOP - 16) { doc.addPage(); y = tableHeader(doc, d, M) }
    if (n % 2) doc.rect(M, y, W, h).fill('#f6f9fb')
    doc.fillColor(INK).font('Helvetica').fontSize(10)
    for (const c of COLS) doc.text(r[c.key], c.x + 6, y + 7, { width: c.w - 12, align: c.align })
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.5).strokeColor(RULE).stroke()
    y += h
  })
  return y
}

function totals (doc, d, top) {
  let y = top + 14
  if (y > FOOTER_TOP - 120) { doc.addPage(); y = M }
  const x = M + W - 270
  doc.rect(x, y, 270, 30).fill(BRAND)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10.5).text(d.labels.total, x + 12, y + 10, { width: 140 })
  doc.fontSize(13).text(d.totalText, x + 150, y + 8.5, { width: 108, align: 'right' })
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text(d.labels.noVat, M, y + 38, { width: W, align: 'right' })
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(d.labels.thanks, M, y + 70, { width: W })
  return y + 70
}

function footers (doc, d) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Writing below the bottom margin would add pages; lift the margin while the footer is drawn.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.moveTo(M, FOOTER_TOP + 14).lineTo(M + W, FOOTER_TOP + 14).lineWidth(0.5).strokeColor(RULE).stroke()
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(d.store.name || '', M, FOOTER_TOP + 22, { width: W, align: 'center' })
    doc.font('Helvetica').fontSize(8).text(d.footer.join('   |   '), M, FOOTER_TOP + 33, { width: W, align: 'center' })
    doc.text(d.pageText(i - range.start + 1, range.count), M, FOOTER_TOP + 47, { width: W, align: 'center' })
    doc.page.margins.bottom = bottom
  }
}

export function renderInvoice (d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `${d.title} ${d.number}`, Author: d.store.name || '' } })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    header(doc, d)
    const afterParties = parties(doc, d, M + 84)
    const afterTable = table(doc, d, afterParties + 28)
    totals(doc, d, afterTable)
    footers(doc, d)
    doc.end()
  })
}
