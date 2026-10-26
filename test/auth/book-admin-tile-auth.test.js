import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const land = '/odata/v4/landing'
const admin = '/odata/v4/admin'
const A1 = 'a1111111-1111-4111-8111-111111111111'

describe('LandingService isBookAdmin() role matrix', () => {
  describe.each(['alice', 'dave', 'frank', 'erin'])('%s', name => {
    it('returns true', async () => {
      const res = await GET(`${land}/isBookAdmin()`, user(name))
      expect(res.status).toBe(200)
      expect(res.data.value).toBe(true)
    })
  })

  describe.each(['gina', 'hugo', 'carol', 'ivy', 'bob'])('%s (no BookAdmin)', name => {
    it('returns false, not an error', async () => {
      const res = await GET(`${land}/isBookAdmin()`, user(name))
      expect(res.status).toBe(200)
      expect(res.data.value).toBe(false)
    })
  })

  it('anonymous -> 401', async () => {
    expect((await GET(`${land}/isBookAdmin()`)).status).toBe(401)
  })
})

describe('AdminService Books: tile target is open to BookAdmin only', () => {
  describe.each(['alice', 'dave'])('%s (BookAdmin)', name => {
    it('reads Books and creates a draft (then discards it)', async () => {
      expect((await GET(`${admin}/Books`, user(name))).status).toBe(200)
      const c = await POST(`${admin}/Books`, { title: 'Tile Auth', author_ID: A1, price: 1, stock: 1 }, user(name))
      expect(c.status).toBe(201)
      expect((await DELETE(`${admin}/Books(ID=${c.data.ID},IsActiveEntity=false)`, user(name))).status).toBe(204)
    })
  })

  describe.each(['gina', 'carol', 'bob'])('%s (no BookAdmin) -> 403', name => {
    it('GET Books', async () => {
      expect((await GET(`${admin}/Books`, user(name))).status).toBe(403)
    })
    it('POST Books', async () => {
      expect((await POST(`${admin}/Books`, { title: 'X', author_ID: A1, price: 1, stock: 1 }, user(name))).status).toBe(403)
    })
    it.each(['Authors', 'Genres', 'Customers'])('GET %s', async entity => {
      expect((await GET(`${admin}/${entity}`, user(name))).status).toBe(403)
    })
  })
})

describe('AdminService Authors (editable, draft-enabled): BookAdmin only', () => {
  const act = `${admin}/Authors(ID=${A1},IsActiveEntity=true)`
  const drf = `${admin}/Authors(ID=${A1},IsActiveEntity=false)`

  describe.each(['gina', 'carol', 'bob'])('%s (no BookAdmin) -> 403', name => {
    const o = () => user(name)
    const cases = {
      'GET Authors': () => GET(`${admin}/Authors`, o()),
      'GET Author by key': () => GET(act, o()),
      'POST Authors': () => POST(`${admin}/Authors`, { name: 'X' }, o()),
      'PATCH active Author': () => PATCH(act, { name: 'X' }, o()),
      'PATCH draft Author': () => PATCH(drf, { name: 'X' }, o()),
      'DELETE active Author': () => DELETE(act, o()),
      'DELETE draft Author': () => DELETE(drf, o()),
      'draftEdit Author': () => POST(`${act}/AdminService.draftEdit`, { PreserveChanges: true }, o()),
      'draftActivate Author': () => POST(`${drf}/AdminService.draftActivate`, {}, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(403)
    })
  })

  it.each(['alice', 'dave', 'frank', 'erin'])('%s (BookAdmin) can create an Author draft (then discards it)', async name => {
    const c = await POST(`${admin}/Authors`, { name: 'Tile Auth Author' }, user(name))
    expect(c.status).toBe(201)
    expect((await DELETE(`${admin}/Authors(ID=${c.data.ID},IsActiveEntity=false)`, user(name))).status).toBe(204)
  })

  it('anonymous -> 401 on GET and POST', async () => {
    expect((await GET(`${admin}/Authors`)).status).toBe(401)
    expect((await POST(`${admin}/Authors`, { name: 'X' })).status).toBe(401)
  })
})

describe('AdminService read access for BookAdmin of another tenant (erin, t2)', () => {
  it.each(['Books', 'Authors'])('erin can GET %s', async entity => {
    expect((await GET(`${admin}/${entity}`, user('erin'))).status).toBe(200)
  })
})
