import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PSEUDO_ROLES = ['any', 'authenticated-user', 'system-user', 'internal-user']

const rolesOf = value => (Array.isArray(value) ? value : [value]).filter(Boolean)

describe('xs-security.json matches the roles used in the model', () => {
  let xs
  it('is valid JSON', () => {
    xs = JSON.parse(fs.readFileSync(path.join(root, 'xs-security.json'), 'utf8'))
  })

  it('defines scopes only as $XSAPPNAME.<name> and no role-template fields in scopes', () => {
    for (const scope of xs.scopes) {
      expect(scope.name).toMatch(/^\$XSAPPNAME\./)
      expect(scope).not.toHaveProperty('scope-references')
    }
  })

  it('has a scope and a role template for every role in @requires and @restrict', async () => {
    const model = await cds.load('*')
    const used = new Set()
    for (const def of Object.values(model.definitions)) {
      rolesOf(def['@requires']).forEach(r => used.add(r))
      for (const grant of def['@restrict'] || []) rolesOf(grant.to).forEach(r => used.add(r))
    }
    PSEUDO_ROLES.forEach(r => used.delete(r))
    expect(used.size).toBeGreaterThan(0)

    const scopes = xs.scopes.map(s => s.name)
    const templates = (xs['role-templates'] || []).map(t => t.name)
    for (const role of used) {
      expect(scopes).toContain(`$XSAPPNAME.${role}`)
      expect(templates).toContain(role)
    }
  })

  it('references only defined scopes in role templates', () => {
    const scopes = xs.scopes.map(s => s.name)
    for (const t of xs['role-templates'] || []) {
      for (const ref of t['scope-references']) expect(scopes).toContain(ref)
    }
  })
})
