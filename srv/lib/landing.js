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

// No orders exist yet, so there is nothing to rank. Replace with the real ranking in the orders slice.
export function noBestSellers () {
  return []
}
