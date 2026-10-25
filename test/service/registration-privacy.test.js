import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { POST, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const bob = { auth: { username: 'bob', password: '' } }
const reg = '/odata/v4/registration/registerCustomer'
const log = cds.test.log()

// CAP raises ASSERT_DATA_TYPE for over-long parameters and puts the submitted value into message and args.
// Submitted names and emails are personal data: they must not appear in the response or in the logs.
describe('RegistrationService does not echo rejected personal data', () => {
  beforeEach(() => log.clear())

  it.each([
    ['name', { name: 'LEAKNAME'.padEnd(112, 'x'), email: 'bob@example.com' }, 'LEAKNAME'],
    ['email', { name: 'Bob', email: 'leakmail'.padEnd(256, 'x') + '@example.com' }, 'leakmail']
  ])('too long %s: 400, value in neither response nor log', async (_, body, marker) => {
    const res = await POST(reg, body, bob)
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.data)).not.toContain(marker)
    expect(log.output).not.toContain(marker)
  })
})
