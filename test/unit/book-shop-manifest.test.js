import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app/book-shop/webapp/manifest.json'), 'utf8'))
const targets = manifest['sap.ui5'].routing.targets

describe('book-shop manifest', () => {
  it('reads from the read-only catalog service', () => {
    expect(manifest['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/catalog/')
  })

  it('routes list report to object page for /Books', () => {
    const routes = manifest['sap.ui5'].routing.routes
    expect(routes.map(r => r.target)).toEqual(['BooksList', 'BooksObjectPage'])
    expect(targets.BooksList.options.settings.contextPath).toBe('/Books')
    expect(targets.BooksObjectPage.options.settings.contextPath).toBe('/Books')
    expect(targets.BooksList.options.settings.navigation.Books.detail.route).toBe('BooksObjectPage')
  })

  it('configures no create or edit actions and no draft-only settings', () => {
    const settings = JSON.stringify(manifest['sap.ui5'].routing)
    expect(settings).not.toMatch(/"(creationMode|createMode|inlineCreationRows|editFlow|actions)"/)
    expect(targets.BooksObjectPage.options.settings.editableHeaderContent).toBe(false)
  })

  it('has no hard-coded app texts', () => {
    expect(manifest['sap.app'].title).toBe('{{appTitle}}')
    expect(manifest['sap.app'].description).toBe('{{appDescription}}')
  })
})
