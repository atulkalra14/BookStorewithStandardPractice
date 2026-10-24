import cds from '@sap/cds'

describe('project smoke test', () => {
  it('loads the CDS model without errors', async () => {
    const model = await cds.load('*')
    expect(model).toBeDefined()
  })

  it('uses en as default language', () => {
    expect(cds.env.i18n.default_language).toBe('en')
  })
})
