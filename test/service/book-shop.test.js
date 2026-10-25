import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
 const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = { auth: { username: 'alice', password: '' } }
const base = '/odata/v4/catalog'
const A1 = 'a1111111-1111-4111-8111-111111111111'
const B1 = 'b1111111-1111-4111-8111-111111111111'

describe('book-shop app: $metadata annotations', () => {
  let edmx
  beforeAll(async () => {
    const res = await GET(`${base}/$metadata`, alice)
    expect(res.status).toBe(200)
    edmx = String(res.data)
  })

  it.each(['UI.LineItem', 'UI.SelectionFields', 'UI.HeaderInfo', 'UI.FieldGroup', 'UI.Facets'])('contains %s', term => {
    expect(edmx).toMatch(new RegExp(`Term="${term.replace('.', '\\.')}`))
  })

  it('contains Common.ValueList on Books/author_ID (FK used by filter bar and column) pointing to Authors', () => {
    const m = edmx.match(/<Annotations Target="CatalogService.Books\/author_ID">[\s\S]*?<\/Annotations>/)
    expect(m).not.toBeNull()
    expect(m[0]).toContain('Term="Common.ValueList"')
    expect(m[0]).toContain('Authors')
  })

  it('SelectionFields lists title and author_ID', () => {
    const m = edmx.match(/Term="UI.SelectionFields"[\s\S]*?<\/Annotation>/)
    expect(m[0]).toContain('title')
    expect(m[0]).toContain('author_ID')
  })
})

describe('book-shop app: reads as alice (BookViewer)', () => {
  it('filters by title', async () => {
    const res = await GET(`${base}/Books?$filter=title eq 'Test Book One'`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(b => b.ID)).toEqual([B1])
  })

  it('filter by unknown title returns an empty list', async () => {
    const res = await GET(`${base}/Books?$filter=title eq 'Nope'`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toEqual([])
  })

  it('filters by author_ID', async () => {
    const res = await GET(`${base}/Books?$filter=author_ID eq ${A1}&$orderby=title`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(b => b.title)).toEqual(['Test Book One', 'Test Book Two'])
  })

  it('expands author and orders by title', async () => {
    const res = await GET(`${base}/Books?$expand=author&$orderby=title`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(3)
    for (const b of res.data.value) expect(b.author).toMatchObject({ ID: b.author_ID })
    expect(res.data.value[0].author.name).toBe('Test Author One')
  })

  it('combines title and author_ID filters (list report filter bar)', async () => {
    const res = await GET(`${base}/Books?$filter=author_ID eq ${A1} and title eq 'Test Book Two'&$expand=author`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0].author.name).toBe('Test Author One')
  })

  it('reads the object page entity by key with author', async () => {
    const res = await GET(`${base}/Books(${B1})?$expand=author`, alice)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ ID: B1, title: 'Test Book One', author: { name: 'Test Author One' } })
  })

  it('value help reads Authors (ID, name)', async () => {
    const res = await GET(`${base}/Authors?$select=ID,name&$orderby=name`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(a => a.name)).toEqual(['Test Author One', 'Test Author Two'])
  })

  it('value help supports search-like filter on name', async () => {
    const res = await GET(`${base}/Authors?$filter=contains(name,'Two')`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(a => a.ID)).toEqual(['a2222222-2222-4222-8222-222222222222'])
  })
})

describe('book-shop app: read-only', () => {
  it('alice POST/PATCH/DELETE on Books are rejected with 405', async () => {
    const r = [
      await POST(`${base}/Books`, { title: 'X', author_ID: A1 }, alice),
      await PATCH(`${base}/Books(${B1})`, { title: 'X' }, alice),
      await DELETE(`${base}/Books(${B1})`, alice)
    ]
    expect(r.map(x => x.status)).toEqual([405, 405, 405])
  })

  it('data is unchanged after rejected writes', async () => {
    await PATCH(`${base}/Books(${B1})`, { title: 'Hacked' }, alice)
    const res = await GET(`${base}/Books(${B1})`, alice)
    expect(res.data.title).toBe('Test Book One')
  })
})
