import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('returns UI is read-only after submission', () => {
  it('hides the Edit and Delete buttons through UI.UpdateHidden and UI.DeleteHidden', async () => {
    const csn = await cds.load(path.join(root, 'app/services.cds'))
    const returns = cds.compile.for.nodejs(csn).definitions['ReturnService.Returns']
    expect(returns['@UI.UpdateHidden']).toBe(true)
    expect(returns['@UI.DeleteHidden']).toBe(true)
  })
})
