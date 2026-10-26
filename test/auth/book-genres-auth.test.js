import cds from '@sap/cds'
import { root } from '../helpers/genre-fixtures.js'

const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

// alice: BookViewer+BookAdmin+Customer, bob: no roles, carol: BookViewer,
// dave/erin: BookAdmin, gina: Customer (package.json [development] users)
const user = username => (username ? { auth: { username, password: '' } } : undefined)
const cat = '/odata/v4/catalog'
const adm = '/odata/v4/admin'

describe('CatalogService Genres authorization', () => {
  it.each([['alice', 200], ['carol', 200], ['bob', 403], ['dave', 403], ['gina', 403], [undefined, 401]])(
    'GET as %s -> %i', async (name, code) => {
      expect((await GET(`${cat}/Genres`, user(name))).status).toBe(code)
    })

  it.each([['dave', 403], ['bob', 403], [undefined, 401]])('write as %s is denied (%i)', async (name, code) => {
    expect((await POST(`${cat}/Genres`, { code: 'X' }, user(name))).status).toBe(code)
    expect((await PATCH(`${cat}/Genres('Fiction')`, { name: 'X' }, user(name))).status).toBe(code)
    expect((await DELETE(`${cat}/Genres('Fiction')`, user(name))).status).toBe(code)
  })

  it('BookViewer write is rejected with 405 (@readonly)', async () => {
    expect((await POST(`${cat}/Genres`, { code: 'X' }, user('carol'))).status).toBe(405)
    expect((await PATCH(`${cat}/Genres('Fiction')`, {}, user('carol'))).status).toBe(405)
    expect((await DELETE(`${cat}/Genres('Fiction')`, user('carol'))).status).toBe(405)
  })
})

describe('AdminService Genres authorization', () => {
  it.each([['dave', 200], ['erin', 200], ['alice', 200], ['carol', 403], ['bob', 403], ['gina', 403], [undefined, 401]])(
    'GET as %s -> %i', async (name, code) => {
      expect((await GET(`${adm}/Genres`, user(name))).status).toBe(code)
    })

  it('BookAdmin write is rejected with 405 (@readonly)', async () => {
    expect((await POST(`${adm}/Genres`, { code: 'X' }, user('dave'))).status).toBe(405)
    expect((await PATCH(`${adm}/Genres('Fiction')`, {}, user('dave'))).status).toBe(405)
    expect((await DELETE(`${adm}/Genres('Fiction')`, user('dave'))).status).toBe(405)
  })

  it.each([['carol', 403], ['bob', 403], [undefined, 401]])('write as %s is denied (%i)', async (name, code) => {
    expect((await POST(`${adm}/Genres`, { code: 'X' }, user(name))).status).toBe(code)
    expect((await PATCH(`${adm}/Genres('Fiction')`, {}, user(name))).status).toBe(code)
    expect((await DELETE(`${adm}/Genres('Fiction')`, user(name))).status).toBe(code)
  })
})

// No role can write reference data by any other route either: texts, navigation, $batch or a deep payload through Books.
describe.each([['catalog', cat, 'carol'], ['admin', adm, 'dave']])('%s Genres has no other write route', (_, svc, who) => {
  it('Genres_texts and Genres(...)/texts cannot be written', async () => {
    const u = user(who)
    expect((await POST(`${svc}/Genres_texts`, { locale: 'de', code: 'Fiction', name: 'X' }, u)).status).toBe(405)
    expect((await PATCH(`${svc}/Genres_texts(locale='de',code='Fiction')`, { name: 'X' }, u)).status).toBe(405)
    expect((await DELETE(`${svc}/Genres_texts(locale='de',code='Fiction')`, u)).status).toBe(405)
    expect((await POST(`${svc}/Genres('Fiction')/texts`, { locale: 'fr', name: 'X' }, u)).status).toBe(405)
  })

  it('a $batch write is rejected per request', async () => {
    const res = await POST(`${svc}/$batch`, {
      requests: [
        { id: '1', method: 'POST', url: 'Genres', headers: { 'content-type': 'application/json' }, body: { code: 'X' } },
        { id: '2', method: 'DELETE', url: "Genres('Fiction')" }
      ]
    }, user(who))
    expect(res.data.responses.map(r => r.status)).toEqual([405, 405])
  })
})

describe('Genres cannot be created through a deep payload on Books', () => {
  it('genre: { code, name } on an AdminService Books draft is rejected', async () => {
    const res = await POST(`${adm}/Books`, { title: 'Deep', author_ID: 'a1111111-1111-4111-8111-111111111111', genre: { code: 'Evil', name: 'Evil' } }, user('dave'))
    expect(res.status).toBe(400)
    expect((await GET(`${adm}/Genres('Evil')`, user('dave'))).status).toBe(404)
  })
})
