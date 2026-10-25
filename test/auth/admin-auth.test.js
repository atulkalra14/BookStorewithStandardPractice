import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const A1 = 'a1111111-1111-4111-8111-111111111111'
const B1 = 'b1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/admin'
const act = 'IsActiveEntity=true'
const newBook = { title: 'Auth Book', author_ID: A1, price: 1, stock: 1 }

describe('AdminService authorization: denied users', () => {
  describe.each([['bob', 403], ['carol', 403], [undefined, 401]])('%s -> %i', (name, code) => {
    const o = () => user(name)
    const cases = {
      'GET Books': () => GET(`${base}/Books`, o()),
      'GET Authors': () => GET(`${base}/Authors`, o()),
      'GET Books by key': () => GET(`${base}/Books(ID=${B1},${act})`, o()),
      'POST Books': () => POST(`${base}/Books`, newBook, o()),
      'PATCH Books': () => PATCH(`${base}/Books(ID=${B1},${act})`, { stock: 1 }, o()),
      'DELETE Books': () => DELETE(`${base}/Books(ID=${B1},${act})`, o()),
      'draftEdit Books': () => POST(`${base}/Books(ID=${B1},${act})/AdminService.draftEdit`, { PreserveChanges: true }, o()),
      'POST Authors': () => POST(`${base}/Authors`, { name: 'X' }, o()),
      'PATCH Authors': () => PATCH(`${base}/Authors(${A1})`, { name: 'X' }, o()),
      'DELETE Authors': () => DELETE(`${base}/Authors(${A1})`, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(code)
    })
  })
})

describe('AdminService authorization: BookAdmin (dave)', () => {
  const dave = user('dave')

  it('reads Books and Authors', async () => {
    expect((await GET(`${base}/Books`, dave)).status).toBe(200)
    expect((await GET(`${base}/Authors`, dave)).status).toBe(200)
  })

  it('Books full CRUD with draft', async () => {
    const c = await POST(`${base}/Books`, newBook, dave)
    expect(c.status).toBe(201)
    const id = c.data.ID
    const draft = `${base}/Books(ID=${id},IsActiveEntity=false)`
    expect((await POST(`${draft}/AdminService.draftActivate`, {}, dave)).status).toBe(201)
    expect((await GET(`${base}/Books(ID=${id},${act})`, dave)).status).toBe(200)
    const e = await POST(`${base}/Books(ID=${id},${act})/AdminService.draftEdit`, { PreserveChanges: true }, dave)
    expect(e.status).toBe(201)
    expect((await PATCH(draft, { stock: 9 }, dave)).status).toBe(200)
    expect((await POST(`${draft}/AdminService.draftActivate`, {}, dave)).status).toBe(200)
    expect((await DELETE(`${base}/Books(ID=${id},${act})`, dave)).status).toBe(204)
  })

  it('Authors POST/PATCH/DELETE -> 405 (@readonly)', async () => {
    expect((await POST(`${base}/Authors`, { name: 'X' }, dave)).status).toBe(405)
    expect((await PATCH(`${base}/Authors(${A1})`, { name: 'X' }, dave)).status).toBe(405)
    expect((await DELETE(`${base}/Authors(${A1})`, dave)).status).toBe(405)
  })

  it('erin (BookAdmin, t2) has the same permissions', async () => {
    const erin = user('erin')
    expect((await GET(`${base}/Books`, erin)).status).toBe(200)
    expect((await GET(`${base}/Authors`, erin)).status).toBe(200)
    expect((await POST(`${base}/Authors`, { name: 'X' }, erin)).status).toBe(405)
  })

  it('BookAdmin alone does not grant CatalogService access (needs BookViewer) -> 403', async () => {
    expect((await GET('/odata/v4/catalog/Books', dave)).status).toBe(403)
  })
})
