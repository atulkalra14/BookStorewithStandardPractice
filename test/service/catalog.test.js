import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = { auth: { username: 'alice', password: '' } }
const A1 = 'a1111111-1111-4111-8111-111111111111'
const A2 = 'a2222222-2222-4222-8222-222222222222'
const B1 = 'b1111111-1111-4111-8111-111111111111'
const B2 = 'b2222222-2222-4222-8222-222222222222'
const B3 = 'b3333333-3333-4333-8333-333333333333'

describe('CatalogService read (alice, BookViewer)', () => {
  it('reads Books including seed rows', async () => {
    const res = await GET('/odata/v4/catalog/Books', alice)
    expect(res.status).toBe(200)
    const ids = res.data.value.map(b => b.ID)
    expect(ids).toEqual(expect.arrayContaining([B1, B2, B3]))
    const b1 = res.data.value.find(b => b.ID === B1)
    expect(b1).toMatchObject({ title: 'Test Book One', author_ID: A1, stock: 10 })
    expect(Number(b1.price)).toBeCloseTo(9.99)
  })

  it.each(['Books', 'Authors'])('does not expose user IDs (createdBy, modifiedBy) on %s', async entity => {
    const res = await GET(`/odata/v4/catalog/${entity}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    for (const row of res.data.value) {
      expect(row).not.toHaveProperty('createdBy')
      expect(row).not.toHaveProperty('modifiedBy')
    }
  })

  it('reads Authors including seed rows', async () => {
    const res = await GET('/odata/v4/catalog/Authors', alice)
    expect(res.status).toBe(200)
    const ids = res.data.value.map(a => a.ID)
    expect(ids).toEqual(expect.arrayContaining([A1, A2]))
    expect(res.data.value.find(a => a.ID === A1)).toMatchObject({ name: 'Test Author One', dateOfBirth: '1900-01-01' })
  })

  it('expands author on Books', async () => {
    const res = await GET(`/odata/v4/catalog/Books?$expand=author&$filter=ID eq ${B3}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0].author).toMatchObject({ ID: A2, name: 'Test Author Two' })
  })

  it('expands books on Authors', async () => {
    const res = await GET(`/odata/v4/catalog/Authors?$expand=books&$filter=ID eq ${A1}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0].books.map(b => b.ID).sort()).toEqual([B1, B2])
  })

  it('returns 404 for an unknown key', async () => {
    const res = await GET('/odata/v4/catalog/Books(00000000-0000-4000-8000-000000000000)', alice)
    expect(res.status).toBe(404)
  })
})
