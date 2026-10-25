const DAY_MS = 24 * 60 * 60 * 1000
const NEW_ARRIVAL_DAYS = 30

// ISO timestamp of the start of the "new arrivals" window.
export function newArrivalsSince (now = new Date()) {
  return new Date(now.getTime() - NEW_ARRIVAL_DAYS * DAY_MS).toISOString()
}

// validFrom, validTo and today are CDS Dates ('YYYY-MM-DD'), so string comparison is chronological.
export function isActiveOn (discount, today) {
  return discount.validFrom <= today && today <= discount.validTo
}

export function restrictToNewArrivals (req) {
  req.query.where({ createdAt: { '>=': newArrivalsSince() } })
}

export function restrictToActiveDiscounts (req) {
  const today = new Date().toISOString().slice(0, 10)
  req.query.where({ validFrom: { '<=': today }, validTo: { '>=': today } })
}

// price reduced by percent, rounded half up to cents. Works on scaled integers: binary floats would turn 1.035 into 1.03.
// Returns null for input outside the model (percent is an Integer, price at most 999999.99) so one bad row cannot fail the list.
export function discountedPrice (price, percent) {
  const p = price == null ? NaN : Number(price)
  if (!Number.isFinite(p) || p < 0 || p > 1e12 || !Number.isInteger(percent) || percent < 0 || percent > 100) return null
  const scaled = BigInt(p.toFixed(6).replace('.', ''))
  const cents = (scaled * BigInt(100 - percent) * 2n + 1_000_000n) / 2_000_000n
  return Number(cents) / 100
}

// Columns that selectDiscountInputs added only for the handler, per request: addDiscountedPrice removes them again.
const injected = new WeakMap()

// $select=discountedPrice alone would leave the handler without its inputs: add them to the query columns.
export function selectDiscountInputs (req) {
  const columns = req.query.SELECT.columns
  if (!columns || columns.some(c => c === '*' || c.ref?.[0] === '*')) return
  if (!columns.some(c => c.ref?.[0] === 'discountedPrice')) return
  const added = []
  for (const name of ['bookPrice', 'percent']) {
    if (!columns.some(c => c.ref?.[0] === name)) { columns.push({ ref: [name] }); added.push(name) }
  }
  injected.set(req, added)
}

// after READ on ActiveDiscounts: fills the virtual element discountedPrice (array for lists, object for read by key).
export function addDiscountedPrice (result, req) {
  const added = injected.get(req) ?? []
  for (const row of [result].flat()) {
    if (!row) continue
    if (row.bookPrice != null && row.percent != null) row.discountedPrice = discountedPrice(row.bookPrice, row.percent)
    for (const name of added) delete row[name]
  }
}
