import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const B1 = 'b1111111-1111-4111-8111-111111111111'
const A1 = 'a1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/catalog'

describe('CatalogService authorization', () => {
  describe.each(['Books', 'Authors'])('%s', entity => {
    const key = entity === 'Books' ? B1 : A1

    it('BookViewer (alice) may read', async () => {
      expect((await GET(`${base}/${entity}`, user('alice'))).status).toBe(200)
    })
    it('user without roles (bob) gets 403', async () => {
      expect((await GET(`${base}/${entity}`, user('bob'))).status).toBe(403)
    })
    it('anonymous gets 401', async () => {
      expect((await GET(`${base}/${entity}`)).status).toBe(401)
    })

    // @readonly: CAP rejects write events with 405 ENTITY_IS_READ_ONLY
    // (@sap/cds libx/_runtime/common/generic/auth/readOnly.js) for authorized users.
    it('BookViewer cannot POST (405)', async () => {
      const res = await POST(`${base}/${entity}`, { ID: '99999999-9999-4999-8999-999999999999' }, user('alice'))
      expect(res.status).toBe(405)
    })
    it('BookViewer cannot PATCH (405)', async () => {
      expect((await PATCH(`${base}/${entity}(${key})`, {}, user('alice'))).status).toBe(405)
    })
    it('BookViewer cannot DELETE (405)', async () => {
      expect((await DELETE(`${base}/${entity}(${key})`, user('alice'))).status).toBe(405)
    })

    it('user without roles cannot write (403)', async () => {
      expect((await POST(`${base}/${entity}`, {}, user('bob'))).status).toBe(403)
      expect((await PATCH(`${base}/${entity}(${key})`, {}, user('bob'))).status).toBe(403)
      expect((await DELETE(`${base}/${entity}(${key})`, user('bob'))).status).toBe(403)
    })
    it('anonymous cannot write (401)', async () => {
      expect((await POST(`${base}/${entity}`, {})).status).toBe(401)
      expect((await PATCH(`${base}/${entity}(${key})`, {})).status).toBe(401)
      expect((await DELETE(`${base}/${entity}(${key})`)).status).toBe(401)
    })
  })

  // Regression: @readonly once sat on the service only, so entities stayed writable.
  // These paths must stay blocked even if the direct entity-set checks change.
  describe('write bypass attempts by BookViewer (alice)', () => {
    it('navigation writes are rejected (405)', async () => {
      const res = await Promise.all([
        POST(`${base}/Authors(${A1})/books`, { title: 'X' }, user('alice')),
        PATCH(`${base}/Books(${B1})/author`, { name: 'X' }, user('alice')),
        DELETE(`${base}/Authors(${A1})/books(${B1})`, user('alice'))
      ])
      expect(res.map(r => r.status)).toEqual([405, 405, 405])
    })

    it('deep insert of an author with books is rejected (405)', async () => {
      const res = await POST(`${base}/Authors`, { name: 'X', books: [{ title: 'Y' }] }, user('alice'))
      expect(res.status).toBe(405)
    })

    it('write parts inside a JSON $batch are rejected (405)', async () => {
      const res = await POST(`${base}/$batch`, {
        requests: [
          { id: '1', method: 'POST', url: 'Books', headers: { 'content-type': 'application/json' }, body: { title: 'X' } },
          { id: '2', method: 'PATCH', url: `Books(${B1})`, headers: { 'content-type': 'application/json' }, body: { title: 'X' } },
          { id: '3', method: 'DELETE', url: `Books(${B1})` }
        ]
      }, user('alice'))
      expect(res.status).toBe(200)
      expect(res.data.responses.map(r => r.status)).toEqual([405, 405, 405])
    })
  })

  it('failed write attempts leave data unchanged', async () => {
    await PATCH(`${base}/Books(${B1})`, { title: 'Hacked' }, user('alice'))
    await DELETE(`${base}/Authors(${A1})/books(${B1})`, user('alice'))
    const books = await GET(`${base}/Books?$orderby=title`, user('alice'))
    const authors = await GET(`${base}/Authors`, user('alice'))
    expect(books.data.value.map(b => b.title)).toEqual(['Test Book One', 'Test Book Three', 'Test Book Two'])
    expect(authors.data.value).toHaveLength(2)
  })
})
