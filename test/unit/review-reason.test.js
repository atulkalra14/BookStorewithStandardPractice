import { checkReason, MAX_REASON } from '../../srv/lib/review-reason.js'

// Plain unit test of the shared reason check (orders and returns): req.reject is replaced by a recorder.
const run = (reason, rule = { reasonRequired: true }) => {
  const rejected = []
  const req = { data: { reason }, reject: arg => { rejected.push(arg); return 'rejected' } }
  return { result: checkReason(req, rule), rejected }
}

describe('checkReason', () => {
  it('returns a plain reason unchanged', () => {
    expect(run('Out of print').result).toBe('Out of print')
  })

  it('trims surrounding whitespace', () => {
    expect(run('  Out of print \n').result).toBe('Out of print')
  })

  it('keeps tabs and line breaks inside the text (the field is multi-line)', () => {
    expect(run('Line one\nLine two\tend').result).toBe('Line one\nLine two\tend')
  })

  it('removes control characters such as NUL and ESC', () => {
    expect(run('ok\u0000\u001b[31m\u007f').result).toBe('ok[31m')
  })

  it.each(['‮', '‪', '⁦', '⁩', '‎', '‏'])('removes the bidirectional control character %j', ch => {
    expect(run(`abc${ch}def`).result).toBe('abcdef')
  })

  it('normalises the text to NFC', () => {
    expect(run('Café').result).toBe('Café')
  })

  it('a reason that is only control characters and whitespace counts as blank', () => {
    const { rejected } = run(' \u0000‮\n ')
    expect(rejected).toEqual([expect.objectContaining({ status: 400, code: 'ERR_ORDER_REASON_REQUIRED', target: 'reason' })])
  })

  it('a blank reason gives null when none is required', () => {
    expect(run('   ', { reasonRequired: false })).toEqual({ result: null, rejected: [] })
    expect(run(undefined, { reasonRequired: false }).result).toBeNull()
  })

  it('counts the length after cleaning: 500 is fine, 501 is too long', () => {
    expect(run('r'.repeat(MAX_REASON) + '‮').result).toHaveLength(MAX_REASON)
    const { rejected } = run('r'.repeat(MAX_REASON + 1))
    expect(rejected).toEqual([expect.objectContaining({ status: 400, code: 'ERR_ORDER_REASON_TOO_LONG', args: [MAX_REASON], target: 'reason' })])
  })
})
