import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const GENRE_CODES = [
  'Fiction', 'NonFiction', 'MysteryThriller', 'SciFiFantasy', 'Romance',
  'Biography', 'History', 'ScienceTech', 'Children', 'SelfHelp'
]

// Semicolon-separated CSV (same format as db/data/bookstore-ReturnReasons.csv). Throws if missing.
export function readCsv(rel) {
  const [head, ...lines] = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/).filter(l => l.trim())
  const cols = head.split(';')
  return lines.map(l => {
    const v = l.split(';')
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]))
  })
}
