import cds from '@sap/cds'

const { SELECT } = cds.ql

// An author that still has books cannot be deleted: the books would keep a reference to a missing author in every tenant.
// Checked through the service, so the BookAdmin rules apply. Only active books are visible here (drafts of other admins are
// not), so rejectMissingAuthor below closes the gap when such a draft is activated. A delete racing an activation can still
// slip through between the two checks: only a database foreign key would close that (not configured).
export async function rejectDeleteWithBooks (srv, req) {
  const { Books, Authors } = srv.entities
  const authorId = req.data.ID
  if (!authorId) return req.reject(400, 'ERR_AUTHOR_NOT_FOUND')
  const author = await srv.run(SELECT.one.from(Authors).columns('name').where({ ID: authorId }))
  if (!author) return req.reject(404, 'ERR_AUTHOR_NOT_FOUND')
  const hasBooks = await srv.run(SELECT.one.from(Books).columns('ID').where({ author_ID: authorId }))
  if (hasBooks) return req.reject(400, 'ERR_AUTHOR_HAS_BOOKS', [author.name])
}

// A book may only be saved for an author that still exists (a draft can outlive the author it points to).
export async function rejectMissingAuthor (srv, req) {
  const authorId = req.data.author_ID
  if (!authorId) return
  const { Authors } = srv.entities
  const author = await srv.run(SELECT.one.from(Authors).columns('ID').where({ ID: authorId }))
  if (!author) return req.reject(400, 'ERR_BOOK_AUTHOR_NOT_FOUND')
}
