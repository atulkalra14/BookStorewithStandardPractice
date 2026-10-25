const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Defense in depth: @restrict has no CREATE grant, but a rejected NEW avoids orphan drafts
// that could never be activated. Customers are provisioned outside this service.
export function rejectNew (req) {
  return req.reject(403)
}

// userId anchors the instance restriction. The restriction guarantees the stored value equals
// the caller's ID, so any other value would re-point the record to another identity.
export function rejectUserIdChange (req) {
  if (req.data.userId !== undefined && req.data.userId !== req.user.id) {
    return req.reject(400, 'ERR_CUSTOMER_USERID_IMMUTABLE')
  }
}

// A customer only sees the own row, so draft lock data of others must stay hidden too.
export function ownDraftAdminOnly (req) {
  req.query.where({ CreatedByUser: req.user.id })
}

// The lock error names the lock holder (a user ID). Customers must not learn about other customers.
export function hideLockHolder (err) {
  // At this stage the message still holds the unresolved key.
  if (err.message === 'DRAFT_LOCKED_BY_ANOTHER_USER') {
    err.status = 404
    err.message = 'ERR_CUSTOMER_NOT_FOUND'
  }
}

export function validateEmail (req) {
  if (req.data.email != null && !EMAIL_PATTERN.test(req.data.email)) {
    return req.error({ status: 400, code: 'ERR_EMAIL_INVALID', message: 'ERR_EMAIL_INVALID', target: 'email' })
  }
}
