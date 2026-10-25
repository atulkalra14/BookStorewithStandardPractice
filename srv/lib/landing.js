import cds from '@sap/cds'
import { validateEmail } from './customers.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NEW_ARRIVAL_DAYS = 30

// ISO timestamp of the start of the "new arrivals" window.
export function newArrivalsSince (now = new Date()) {
  return new Date(now.getTime() - NEW_ARRIVAL_DAYS * DAY_MS).toISOString()
}

// validFrom, validTo and today are CDS Dates ('YYYY-MM-DD'), so string comparison is chronological.
export function isActiveOn (discount, today) {
  return discount.validFrom <= today && today <= discount.validTo
}

export function restrictToNewArrivals (req) {
  req.query.where({ createdAt: { '>=': newArrivalsSince() } })
}

export function restrictToActiveDiscounts (req) {
  const today = new Date().toISOString().slice(0, 10)
  req.query.where({ validFrom: { '<=': today }, validTo: { '>=': today } })
}

// No orders exist yet, so there is nothing to rank. Replace with the real ranking in the orders slice.
export function noBestSellers () {
  return []
}

export function validateRegistration (req) {
  const { name, email } = req.data
  if (!name?.trim()) {
    req.error({ status: 400, code: 'ERR_NAME_REQUIRED', message: 'ERR_NAME_REQUIRED', target: 'name' })
  }
  if (!email?.trim()) {
    req.error({ status: 400, code: 'ERR_EMAIL_REQUIRED', message: 'ERR_EMAIL_REQUIRED', target: 'email' })
  } else {
    validateEmail(req)
  }
}

const LOG = cds.log('landing')

// CAP puts the submitted value into message and args of ASSERT_DATA_TYPE errors (for example a too long name).
// Names and emails are personal data, so replace them with a key before the error is logged or returned.
const REGISTRATION_INPUT_ERRORS = { name: 'ERR_NAME_INVALID', email: 'ERR_EMAIL_INVALID' }
export function hideSubmittedValue (err) {
  if (err.code === 'ASSERT_DATA_TYPE' && REGISTRATION_INPUT_ERRORS[err.target]) {
    err.message = REGISTRATION_INPUT_ERRORS[err.target]
    err.args = []
  }
}

// Creates the Customers row of the logged-in user. The user ID always comes from the token, never from the request body.
// AUTHORIZATION BYPASS (deliberate, reviewed): Customers is not exposed for creation in any service, so this writes
// through the db service, without service-level authorization. Access is limited by @requires 'authenticated-user' on
// RegistrationService; tenant and user come from the request context. Pinned by test/service/registration.test.js.
export async function registerCustomer (req) {
  const { Customers } = cds.entities('bookstore')
  const { SELECT, INSERT } = cds.ql
  const userId = req.user.id
  const alreadyRegistered = () => SELECT.one.from(Customers).columns('ID').where({ userId })

  if (await alreadyRegistered()) return req.reject(409, 'ERR_ALREADY_REGISTERED')
  const ID = cds.utils.uuid()
  try {
    await INSERT.into(Customers).entries({ ID, name: req.data.name.trim(), email: req.data.email.trim(), userId })
  } catch (err) {
    // Input is validated before this handler, so a failing insert is either a parallel registration of the same
    // user (unique userId) or an unexpected error. Log the error code only: messages may contain personal data.
    if (await alreadyRegistered()) return req.reject(409, 'ERR_ALREADY_REGISTERED')
    LOG.error('registerCustomer failed', { code: err.code })
    return req.reject(500, 'ERR_UNEXPECTED')
  }
  return { ID }
}
