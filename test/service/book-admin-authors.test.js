import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { A1, base, user, dKey, aKey, authorApi, code } from '../helpers/author-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = authorApi(t)

const dave = user('dave')
const frank = user('frank')

describe('AdminService Authors draft flows (dave, BookAdmin)', () => {
  const authors = []
  const books = []
  afterEach(async () => {
    await api.cleanup(dave, { authors: authors.splice(0), books: books.splice(0) })
  })
  const mk = async name => { const id = await api.create(dave, name); authors.push(id); return id }

  it('create -> activate: draft is not active until activation, then readable as active', async () => {
    const id = await api.newDraft(dave, { name: 'Draft Author', dateOfBirth: '1980-02-03' })
    authors.push(id)
    expect((await GET(dKey(id), dave)).status).toBe(200)
    expect((await GET(aKey(id), dave)).status).toBe(404)

    const act = await api.activate(id, dave)
    expect(act.status).toBe(201)
    expect(act.data).toMatchObject({ ID: id, name: 'Draft Author', IsActiveEntity: true })

    const got = await GET(aKey(id), dave)
    expect(got.status).toBe(200)
    expect(got.data).toMatchObject({ name: 'Draft Author', dateOfBirth: '1980-02-03' })
    expect((await GET(dKey(id), dave)).status).toBe(404)
  })

  it('PATCH on a draft updates the draft only', async () => {
    const id = await api.newDraft(dave)
    authors.push(id)
    const p = await PATCH(dKey(id), { name: 'Changed' }, dave)
    expect(p.status).toBe(200)
    expect(p.data.name).toBe('Changed')
  })

  it('edit -> patch -> activate updates the active row', async () => {
    const id = await mk('Before Edit')
    const e = await api.edit(id, dave)
    expect(e.status).toBe(201)
    expect(e.data).toMatchObject({ ID: id, IsActiveEntity: false })
    expect((await PATCH(dKey(id), { name: 'After Edit' }, dave)).status).toBe(200)
    expect((await GET(aKey(id), dave)).data.name).toBe('Before Edit')
    expect((await api.activate(id, dave)).status).toBe(200)
    expect((await GET(aKey(id), dave)).data.name).toBe('After Edit')
  })

  it('cancel edit (DELETE draft) discards changes and keeps the active row', async () => {
    const id = await mk('Keep Me')
    await api.edit(id, dave)
    await PATCH(dKey(id), { name: 'Discard Me' }, dave)
    expect((await DELETE(dKey(id), dave)).status).toBe(204)
    expect((await GET(dKey(id), dave)).status).toBe(404)
    expect((await GET(aKey(id), dave)).data.name).toBe('Keep Me')
  })

  it('cancel of a new draft leaves no active row', async () => {
    const id = await api.newDraft(dave)
    expect((await DELETE(dKey(id), dave)).status).toBe(204)
    expect((await GET(dKey(id), dave)).status).toBe(404)
    expect((await GET(aKey(id), dave)).status).toBe(404)
  })

  it('does not expose createdBy / modifiedBy', async () => {
    const res = await GET(`${base}/Authors?$filter=IsActiveEntity eq true`, dave)
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    for (const row of res.data.value) {
      expect(row).not.toHaveProperty('createdBy')
      expect(row).not.toHaveProperty('modifiedBy')
    }
  })

  describe('delete', () => {
    it('an author without books is deleted (204)', async () => {
      const id = await mk('Delete Me')
      expect((await DELETE(aKey(id), dave)).status).toBe(204)
      expect((await GET(aKey(id), dave)).status).toBe(404)
    })

    it('an author WITH books is rejected: 400 ERR_AUTHOR_HAS_BOOKS, author and book stay readable', async () => {
      const id = await mk('Has Books')
      books.push(await api.addBook(dave, id, 'Blocking Book'))
      const res = await DELETE(aKey(id), dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_AUTHOR_HAS_BOOKS')
      const still = await GET(aKey(id), dave)
      expect(still.status).toBe(200)
      expect(still.data.name).toBe('Has Books')
      const list = await GET(`${base}/Books?$filter=author_ID eq ${id} and IsActiveEntity eq true`, dave)
      expect(list.data.value).toHaveLength(1)
    })

    it('a seeded author with books (Test Author One) cannot be deleted', async () => {
      const res = await DELETE(aKey(A1), dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_AUTHOR_HAS_BOOKS')
      expect((await GET(aKey(A1), dave)).status).toBe(200)
    })

    it('after the last book is deleted the author can be deleted', async () => {
      const id = await mk('Becomes Free')
      const b = await api.addBook(dave, id, 'Short Lived')
      expect((await DELETE(aKey(id), dave)).status).toBe(400)
      expect((await DELETE(`${base}/Books(ID=${b},IsActiveEntity=true)`, dave)).status).toBe(204)
      expect((await DELETE(aKey(id), dave)).status).toBe(204)
      expect((await GET(aKey(id), dave)).status).toBe(404)
    })

    it('cancelling an edit draft of an author with books is still allowed (only deleting the active author is blocked)', async () => {
      const id = await mk('Edit With Books')
      books.push(await api.addBook(dave, id, 'Edit Blocker'))
      await api.edit(id, dave)
      expect((await DELETE(dKey(id), dave)).status).toBe(204)
      expect((await GET(aKey(id), dave)).status).toBe(200)
    })
  })
})

describe('AdminService Authors draft activation validation', () => {
  const ids = []
  afterEach(async () => { await api.cleanup(dave, { authors: ids.splice(0) }) })

  it.each([['missing name', { dateOfBirth: '1980-01-01' }], ['empty draft', {}]])('%s -> 400 on activate, nothing activated', async (_n, body) => {
    const id = await api.newDraft(dave, body)
    ids.push(id)
    const res = await api.activate(id, dave)
    expect(res.status).toBe(400)
    expect(res.data.error).toBeDefined()
    expect((await GET(aKey(id), dave)).status).toBe(404)
    expect((await GET(dKey(id), dave)).status).toBe(200)
  })

  it('name longer than 111 characters is rejected when the draft is written', async () => {
    const c = await POST(`${base}/Authors`, { name: 'x'.repeat(112) }, dave)
    if (c.status === 201) ids.push(c.data.ID)
    expect(c.status).toBe(400)
  })

  it('boundary: a name of exactly 111 characters is accepted', async () => {
    const id = await api.newDraft(dave, { name: 'x'.repeat(111) })
    ids.push(id)
    expect((await api.activate(id, dave)).status).toBe(201)
  })
})

describe('AdminService Authors draft ownership (dave owns the draft, frank is another BookAdmin)', () => {
  let id
  beforeEach(async () => { id = await api.newDraft(dave, { name: 'Owned author draft' }) })
  afterEach(async () => { await api.cleanup(dave, { authors: [id] }) })

  it('owner can read the draft', async () => {
    expect((await GET(dKey(id), dave)).status).toBe(200)
  })
  it('other admin cannot read the draft (404)', async () => {
    expect((await GET(dKey(id), frank)).status).toBe(404)
  })
  it('other admin cannot patch the draft (403)', async () => {
    expect((await PATCH(dKey(id), { name: 'Hijack' }, frank)).status).toBe(403)
  })
  it('other admin cannot activate the draft (403)', async () => {
    expect((await api.activate(id, frank)).status).toBe(403)
  })
  it('other admin cannot cancel the draft (403); the owner still has it', async () => {
    expect((await DELETE(dKey(id), frank)).status).toBe(403)
    const own = await GET(dKey(id), dave)
    expect(own.status).toBe(200)
    expect(own.data.name).toBe('Owned author draft')
  })
  it('other admin cannot start editing a row that dave is already editing (409)', async () => {
    expect((await api.activate(id, dave)).status).toBe(201)
    expect((await api.edit(id, dave)).status).toBe(201)
    expect((await api.edit(id, frank)).status).toBe(409)
  })
  it('the draft does not show up in the other admin list of drafts', async () => {
    const res = await GET(`${base}/Authors?$filter=IsActiveEntity eq false`, frank)
    expect(res.status).toBe(200)
    expect(res.data.value.map(r => r.ID)).not.toContain(id)
  })
})

// cds.test runs one in-memory SQLite and mocked users drop `tenant` (see test/tenant/admin-tenant.test.js), so real
// isolation needs the mtx sidecar with two subscribed tenants.
describe('Authors admin tenant isolation (dave=t1, erin=t2)', () => {
  it.todo('erin (t2) never sees an author created and activated by dave (t1): needs mtx sidecar with two subscribed tenants')
  it.todo('dave (t1) never sees an author created and activated by erin (t2): needs mtx sidecar with two subscribed tenants')
  it.todo('erin (t2) cannot see or activate dave (t1) Authors draft: needs mtx sidecar with two subscribed tenants')
  it.todo('the has-books check of dave (t1) ignores books of tenant t2: needs mtx sidecar with two subscribed tenants')
})

describe('Books cannot be activated for an author that no longer exists (draft book vs author delete)', () => {
  const authors = []
  const books = []
  afterEach(async () => {
    await api.cleanup(dave, { authors: authors.splice(0), books: books.splice(0) })
  })

  it('author deleted while a draft book still points at it: the book cannot be activated', async () => {
    const authorId = await api.create(dave, 'Soon Gone Author')
    authors.push(authorId)
    const draft = await POST(`${base}/Books`, { title: 'Orphan Candidate', author_ID: authorId, price: 1, stock: 1 }, dave)
    expect(draft.status).toBe(201)
    books.push(draft.data.ID)
    // no active book yet, so the delete rule lets the author go
    expect((await DELETE(aKey(authorId), dave)).status).toBe(204)
    const res = await POST(`${base}/Books(ID=${draft.data.ID},IsActiveEntity=false)/AdminService.draftActivate`, {}, dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_BOOK_AUTHOR_NOT_FOUND')
    expect((await GET(`${base}/Books(ID=${draft.data.ID},IsActiveEntity=true)`, dave)).status).toBe(404)
  })

  it('a book of an existing author still activates', async () => {
    const authorId = await api.create(dave, 'Staying Author')
    authors.push(authorId)
    books.push(await api.addBook(dave, authorId, 'Fine Book'))
  })
})
