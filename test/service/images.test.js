import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, B1, resetOrders, orderApi } from '../helpers/order-fixtures.js'
import { seedLanding, cleanupLanding, DISCOUNTS } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
afterAll(cleanupLanding)
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const as = username => ({ auth: { username, password: '' } })
const COVER1 = '/com.bookstore.landing/images/covers/cover-1.svg'
const HERO = '/com.bookstore.landing/images/hero.svg'

beforeAll(seedLanding)

describe('book cover images', () => {
  it('CatalogService returns imageUrl for books', async () => {
    const res = await t.GET('/odata/v4/catalog/Books', as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.find(b => b.ID === B1).imageUrl).toBe(COVER1)
  })

  it('AdminService returns imageUrl to BookAdmin and denies other users', async () => {
    const ok = await t.GET('/odata/v4/admin/Books', as('alice'))
    expect(ok.status).toBe(200)
    expect(ok.data.value.find(b => b.ID === B1).imageUrl).toBe(COVER1)
    expect((await t.GET('/odata/v4/admin/Books', as('bob'))).status).toBe(403)
  })

  const AUTHOR = 'a1111111-1111-4111-8111-111111111111'
  const createAndActivate = async (ID, imageUrl) => {
    const draft = await t.POST('/odata/v4/admin/Books', { ID, title: 'Image Draft', author_ID: AUTHOR, price: 5, stock: 1, imageUrl }, as('alice'))
    if (draft.status !== 201) return draft
    return t.POST(`/odata/v4/admin/Books(ID=${ID},IsActiveEntity=false)/AdminService.draftActivate`, {}, as('alice'))
  }
  const IDS = Array.from({ length: 5 }, (_, i) => `f0000009-0000-4000-8000-00000000000${i + 1}`)
  afterAll(async () => {
    await cds.db.run(cds.ql.DELETE.from('bookstore.Books').where({ ID: { in: IDS } }))
    await cds.db.run(cds.ql.DELETE.from('AdminService.Books.drafts').where({ ID: { in: IDS } }))
  })

  it('AdminService accepts imageUrl on a draft and keeps it on activation', async () => {
    const url = '/com.bookstore.landing/images/covers/cover-2.svg'
    expect((await createAndActivate(IDS[0], url)).status).toBe(201)
    const got = await t.GET(`/odata/v4/admin/Books(ID=${IDS[0]},IsActiveEntity=true)`, as('alice'))
    expect(got.data.imageUrl).toBe(url)
  })

  it.each(['javascript:alert(1)', 'https://evil.example/x.png', '//evil.example/x.png', 'data:image/svg+xml,<svg/>'])('rejects imageUrl %s', async bad => {
    const i = 1 + ['javascript:alert(1)', 'https://evil.example/x.png', '//evil.example/x.png', 'data:image/svg+xml,<svg/>'].indexOf(bad)
    expect((await createAndActivate(IDS[i], bad)).status).toBe(400)
  })
})

describe('landing images', () => {
  it('NewArrivals returns imageUrl', async () => {
    const res = await t.GET('/odata/v4/landing/NewArrivals', as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.find(b => b.ID === B1)?.imageUrl).toBe(COVER1)
  })

  it('ActiveDiscounts returns bookImageUrl', async () => {
    const res = await t.GET('/odata/v4/landing/ActiveDiscounts', as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.find(d => d.ID === DISCOUNTS.active.ID).bookImageUrl).toBe(COVER1)
  })

  it('StoreInfo returns heroImageUrl', async () => {
    const res = await t.GET('/odata/v4/landing/StoreInfo', as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.some(s => s.heroImageUrl === HERO)).toBe(true)
  })

  it('BestSellers returns imageUrl', async () => {
    await resetOrders()
    await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const res = await t.GET('/odata/v4/landing/BestSellers', as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.find(r => r.ID === B1).imageUrl).toBe(COVER1)
  })

  it('user without a role can read the images, anonymous cannot', async () => {
    expect((await t.GET('/odata/v4/landing/StoreInfo', as('bob'))).status).toBe(200)
    expect((await t.GET('/odata/v4/landing/StoreInfo')).status).toBe(401)
  })
})
