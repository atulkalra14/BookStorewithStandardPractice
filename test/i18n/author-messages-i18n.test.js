import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aKey, authorApi, user, code, msg } from '../helpers/author-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = authorApi(t)

const KEY = 'ERR_AUTHOR_HAS_BOOKS'
const NAME = 'Zeno Testautor'
const dave = lang => user('dave', lang)

describe(`AdminService message ${KEY}`, () => {
  let authorId
  let bookId
  beforeEach(async () => {
    authorId = await api.create(dave('en'), NAME)
    bookId = await api.addBook(dave('en'), authorId, 'Blocking Book')
  })
  afterEach(async () => { await api.cleanup(dave('en'), { authors: [authorId], books: [bookId] }) })

  const attempt = lang => api.DELETE(aKey(authorId), dave(lang))

  it('en: 400 with the key as code, a resolved English text, placeholder filled with the author name', async () => {
    const res = await attempt('en')
    expect(res.status).toBe(400)
    expect(code(res)).toBe(KEY)
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain(KEY)
    expect(msg(res)).not.toMatch(/\{\d\}/)
    expect(msg(res)).toContain(NAME)
  })

  it('de: German text that differs from English, no raw key, author name filled in', async () => {
    const en = await attempt('en')
    const de = await attempt('de')
    expect(de.status).toBe(400)
    expect(code(de)).toBe(KEY)
    expect(msg(de)).not.toContain(KEY)
    expect(msg(de)).not.toMatch(/\{\d\}/)
    expect(msg(de)).toContain(NAME)
    expect(msg(de)).not.toBe(msg(en))
  })

  it('fr falls back to the English text', async () => {
    const en = await attempt('en')
    const fr = await attempt('fr')
    expect(code(fr)).toBe(KEY)
    expect(msg(fr)).toBe(msg(en))
  })
})
