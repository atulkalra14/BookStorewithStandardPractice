// Shared helpers for AdminService.Authors tests. Every call takes the axios verbs of the calling test file.
export const A1 = 'a1111111-1111-4111-8111-111111111111'
export const base = '/odata/v4/admin'
export const user = (username, lang) => ({ auth: { username, password: '' }, ...(lang && { headers: { 'Accept-Language': lang } }) })
export const dKey = id => `${base}/Authors(ID=${id},IsActiveEntity=false)`
export const aKey = id => `${base}/Authors(ID=${id},IsActiveEntity=true)`
export const bookDKey = id => `${base}/Books(ID=${id},IsActiveEntity=false)`
export const bookAKey = id => `${base}/Books(ID=${id},IsActiveEntity=true)`

export function authorApi({ GET, POST, PATCH, DELETE }) {
  const activate = (id, u) => POST(`${dKey(id)}/AdminService.draftActivate`, {}, u)
  const edit = (id, u) => POST(`${aKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, u)
  const newDraft = async (u, body = { name: 'Fixture Author' }) => {
    const res = await POST(`${base}/Authors`, body, u)
    if (res.status !== 201) throw new Error(`author draft failed: ${res.status} ${JSON.stringify(res.data)}`)
    return res.data.ID
  }
  const create = async (u, name = 'Fixture Author') => {
    const id = await newDraft(u, { name })
    const res = await activate(id, u)
    if (res.status !== 201) throw new Error(`author activation failed: ${res.status} ${JSON.stringify(res.data)}`)
    return id
  }
  // an active book of the given author, so the author cannot be deleted
  const addBook = async (u, authorId, title = 'Fixture Book') => {
    const c = await POST(`${base}/Books`, { title, author_ID: authorId, price: 1, stock: 1 }, u)
    if (c.status !== 201) throw new Error(`book draft failed: ${c.status} ${JSON.stringify(c.data)}`)
    const a = await POST(`${bookDKey(c.data.ID)}/AdminService.draftActivate`, {}, u)
    if (a.status !== 201) throw new Error(`book activation failed: ${a.status} ${JSON.stringify(a.data)}`)
    return c.data.ID
  }
  // tolerant cleanup: drafts and active rows, books before authors
  const cleanup = async (u, { authors = [], books = [] } = {}) => {
    for (const b of books) { await DELETE(bookDKey(b), u); await DELETE(bookAKey(b), u) }
    for (const a of authors) { await DELETE(dKey(a), u); await DELETE(aKey(a), u) }
  }
  return { GET, POST, PATCH, DELETE, activate, edit, newDraft, create, addBook, cleanup }
}

// A field-targeted error may be wrapped as MULTIPLE_ERRORS with the real error in details[0].
export const firstError = res => {
  const err = (res.data && res.data.error) || {}
  return (err.details && err.details[0]) || err
}
export const code = res => firstError(res).code || ''
export const msg = res => firstError(res).message || ''
