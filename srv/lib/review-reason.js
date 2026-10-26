export const MAX_REASON = 500

// Control characters (except tab and line breaks, the field is multi-line) and bidirectional overrides are dropped: they
// break exports and logs, and U+202E and friends can make the text look different to the customer than it is.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this pattern
const UNWANTED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

// The reason shown to the customer when the shop decides on an order or a return (AdminService actions).
// The models leave these checks to the handler so that the messages are keyed and translated (CAP's own @mandatory and
// length checks would answer with generic codes before the handler runs).
// Returns the reason to store, cleaned and trimmed: null when none was given and none is required.
export function checkReason (req, { reasonRequired }) {
  const reason = req.data.reason == null ? '' : String(req.data.reason).normalize('NFC').replace(UNWANTED, '').trim()
  if (reason === '') {
    if (reasonRequired) return req.reject({ status: 400, code: 'ERR_ORDER_REASON_REQUIRED', message: 'ERR_ORDER_REASON_REQUIRED', target: 'reason' })
    return null
  }
  if (reason.length > MAX_REASON) {
    return req.reject({ status: 400, code: 'ERR_ORDER_REASON_TOO_LONG', message: 'ERR_ORDER_REASON_TOO_LONG', args: [MAX_REASON], target: 'reason' })
  }
  return reason
}
