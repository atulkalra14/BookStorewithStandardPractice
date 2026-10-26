import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
let books, genre

beforeAll(async () => {
  const model = await cds.load([path.join(root, 'srv'), path.join(root, 'app/book-shop')], { flavor: 'inferred' })
  books = model.definitions['CatalogService.Books']
  genre = books.elements.genre
})

const refs = list => (list || []).map(e => (e.Value ? e.Value['='] : e['=']))

describe('book-shop genre annotations (compiled model)', () => {
  it('UI.LineItem has a DataField on genre_code', () => {
    const f = books['@UI.LineItem'].find(e => e.$Type === 'UI.DataField' && e.Value?.['='] === 'genre_code')
    expect(f).toBeDefined()
  })

  it('UI.SelectionFields includes genre_code', () => {
    expect(refs(books['@UI.SelectionFields'])).toContain('genre_code')
  })

  it('UI.FieldGroup#General has a genre field', () => {
    // A record annotation is flattened in the compiled model: the field list sits under '<term>.Data'.
    const data = books['@UI.FieldGroup#General.Data']
    expect(data).toBeDefined()
    expect(refs(data)).toEqual(expect.arrayContaining([expect.stringMatching(/^genre(_code)?$/)]))
  })

  it('genre shows its name text-only', () => {
    expect(genre['@Common.Text']['=']).toBe('genre.name')
    expect(genre['@Common.TextArrangement']['#']).toBe('TextOnly')
  })

  it("Common.ValueList on genre points at CollectionPath 'Genres' with a genre_code InOut", () => {
    expect(genre['@Common.ValueList.CollectionPath']).toBe('Genres')
    const params = genre['@Common.ValueList.Parameters']
    const inout = params.find(p => p.$Type === 'Common.ValueListParameterInOut')
    expect(inout.LocalDataProperty['=']).toBe('genre_code')
    expect(inout.ValueListProperty).toBe('code')
  })
})
