import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
 const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const base = '/odata/v4/catalog'

describe('book-shop app authorization (read access used by the Fiori app)', () => {
  describe.each(['Books', 'Authors', '$metadata'])('%s', resource => {
    it.each(['alice', 'carol'])('BookViewer %s gets 200', async name => {
      expect((await GET(`${base}/${resource}`, user(name))).status).toBe(200)
    })
    it.each(['bob', 'dave', 'erin'])('%s (no BookViewer role) gets 403', async name => {
      expect((await GET(`${base}/${resource}`, user(name))).status).toBe(403)
    })
    it('anonymous gets 401', async () => {
      expect((await GET(`${base}/${resource}`)).status).toBe(401)
    })
  })
})
