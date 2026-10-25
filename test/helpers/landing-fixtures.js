// Test fixtures for the landing page slice.
// NOTE: fixtures are written through cds.db directly (no authorization, no handlers). This is
// acceptable for test setup only; the behaviour under test is always exercised through the services.
import cds from '@sap/cds'

const DAY = 24 * 60 * 60 * 1000
export const daysAgo = (n, now = Date.now()) => new Date(now - n * DAY).toISOString()
export const dateOffset = (n, now = Date.now()) => new Date(now + n * DAY).toISOString().slice(0, 10)

const AUTHOR = 'a1111111-1111-4111-8111-111111111111'
const BOOK = 'b1111111-1111-4111-8111-111111111111'

export const BOOKS = {
  fresh: { ID: 'f0000001-0000-4000-8000-000000000001', title: 'LT Fresh Book (1 day)', age: 1 },
  edge29: { ID: 'f0000001-0000-4000-8000-000000000029', title: 'LT Book 29 days', age: 29 },
  edge31: { ID: 'f0000001-0000-4000-8000-000000000031', title: 'LT Book 31 days', age: 31 },
  old: { ID: 'f0000001-0000-4000-8000-000000000090', title: 'LT Old Book (90 days)', age: 90 }
}

export const DISCOUNTS = {
  active: { ID: 'd0000001-0000-4000-8000-000000000001', percent: 10, from: -10, to: 10, en: 'Active EN', de: 'Aktiv DE' },
  startsToday: { ID: 'd0000001-0000-4000-8000-000000000002', percent: 15, from: 0, to: 5, en: 'Starts today EN', de: 'Beginnt heute DE' },
  endsToday: { ID: 'd0000001-0000-4000-8000-000000000003', percent: 20, from: -5, to: 0, en: 'Ends today EN', de: 'Endet heute DE' },
  expired: { ID: 'd0000001-0000-4000-8000-000000000004', percent: 30, from: -20, to: -1, en: 'Expired EN', de: 'Abgelaufen DE' },
  future: { ID: 'd0000001-0000-4000-8000-000000000005', percent: 40, from: 1, to: 20, en: 'Future EN', de: 'Zukunft DE' }
}

export const STORE = { ID: 's0000001-0000-4000-8000-000000000001', name: 'LT Test Store', openingHours: 'Mon-Fri 9-18', openingHoursDe: 'Mo-Fr 9-18 Uhr', description: 'We sell books.', descriptionDe: 'Wir verkaufen Buecher.' }

export async function seedLanding() {
  const { INSERT, UPDATE } = cds.ql
  const db = cds.db
  for (const b of Object.values(BOOKS)) {
    const createdAt = daysAgo(b.age)
    await db.run(INSERT.into('bookstore.Books').entries({ ID: b.ID, title: b.title, author_ID: AUTHOR, price: 5, stock: 1, createdAt }))
    // ensure createdAt is not overwritten by the managed aspect
    await db.run(UPDATE('bookstore.Books').set({ createdAt }).where({ ID: b.ID }))
  }
  for (const d of Object.values(DISCOUNTS)) {
    await db.run(INSERT.into('bookstore.Discounts').entries({ ID: d.ID, book_ID: BOOK, percent: d.percent, validFrom: dateOffset(d.from), validTo: dateOffset(d.to), description: d.en }))
    await db.run(INSERT.into('bookstore.Discounts.texts').entries({ locale: 'de', ID: d.ID, description: d.de }))
  }
  await db.run(INSERT.into('bookstore.StoreInfo').entries({ ID: STORE.ID, name: STORE.name, address: 'Main St 1', phone: '123', openingHours: STORE.openingHours, description: STORE.description }))
  await db.run(INSERT.into('bookstore.StoreInfo.texts').entries({ locale: 'de', ID: STORE.ID, openingHours: STORE.openingHoursDe, description: STORE.descriptionDe }))
}

export async function cleanupLanding() {
  const { DELETE } = cds.ql
  const db = cds.db
  const dIds = Object.values(DISCOUNTS).map(d => d.ID)
  await db.run(DELETE.from('bookstore.Discounts.texts').where({ ID: { in: dIds } }))
  await db.run(DELETE.from('bookstore.Discounts').where({ ID: { in: dIds } }))
  await db.run(DELETE.from('bookstore.StoreInfo.texts').where({ ID: STORE.ID }))
  await db.run(DELETE.from('bookstore.StoreInfo').where({ ID: STORE.ID }))
  await db.run(DELETE.from('bookstore.Books').where({ ID: { in: Object.values(BOOKS).map(b => b.ID) } }))
}
