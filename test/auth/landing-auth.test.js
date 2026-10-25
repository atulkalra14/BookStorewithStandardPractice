import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const land = '/odata/v4/landing'
const entities = ['NewArrivals', 'ActiveDiscounts', 'StoreInfo', 'BestSellers']

// Any logged-in user may read the landing page, also users without a role. Only anonymous access is denied (no public endpoint).
describe('LandingService authorization matrix (read)', () => {
  describe.each([['alice', 200], ['gina', 200], ['hugo', 200], ['carol', 200], ['ivy', 200], ['dave', 200], ['erin', 200], ['bob', 200], [undefined, 401]])('%s -> %i', (name, code) => {
    it.each(entities)('GET %s', async e => {
      expect((await GET(`${land}/${e}`, user(name))).status).toBe(code)
    })
    it('GET $metadata', async () => {
      expect((await GET(`${land}/$metadata`, user(name))).status).toBe(code)
    })
  })
})

describe('LandingService authorization: writes never succeed', () => {
  describe.each([['alice', [405]], ['gina', [405]], ['dave', [405]], ['bob', [405]], [undefined, [401]]])('%s', (name, codes) => {
    it.each(entities)('POST/DELETE %s', async e => {
      const o = user(name)
      expect(codes).toContain((await POST(`${land}/${e}`, { ID: '00000000-0000-4000-8000-000000000001' }, o)).status)
      expect(codes).toContain((await DELETE(`${land}/${e}(00000000-0000-4000-8000-000000000001)`, o)).status)
    })
  })
})
