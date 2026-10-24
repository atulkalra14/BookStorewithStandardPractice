#!/usr/bin/env node
/* eslint-disable no-console */
'use strict'

/**
 * i18n consistency check for SAP CAP (Node.js) projects. No dependencies.
 *
 * Finds every bundle folder named `_i18n` or `i18n` (model texts, runtime messages,
 * Fiori app bundles under app/<app>/webapp/i18n) and checks, per bundle
 * (`i18n`, `messages`, ...):
 *   ERROR  a required language has no file
 *   ERROR  a key of the default file is missing in a language file
 *   ERROR  empty value
 *   ERROR  placeholder mismatch, e.g. {0} in the default text but not in the translation
 *   ERROR  duplicate key in one file
 *   ERROR  language files exist but the default file (no suffix) is missing
 *   WARN   key in a language file that does not exist in the default file
 *   WARN   language file for a language that is not in --languages
 *   WARN   key of the default file that is not found in db/, srv/ or app/ sources (heuristic)
 *
 * Usage:
 *   node scripts/check-i18n.js [--languages=en,de] [--default=en] [--root=.] [--fail-on-unused]
 * The language list can also come from the I18N_LANGUAGES environment variable.
 * Exit code 1 if any ERROR (or unused key with --fail-on-unused), otherwise 0.
 *
 * Limitation: a base name that ends in _<2-3 letters> (for example my_app.properties)
 * is read as language "app". Avoid such bundle names.
 */

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const opt = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const flag = name => args.includes(`--${name}`)

const ROOT = path.resolve(opt('root', process.cwd()))
const DEFAULT_LANG = opt('default', 'en')
const LANGS = opt('languages', process.env.I18N_LANGUAGES || 'en,de')
  .split(',').map(s => s.trim()).filter(Boolean)
const FAIL_ON_UNUSED = flag('fail-on-unused')

const IGNORE = new Set(['node_modules', 'gen', '.git', 'dist', 'mta_archives', 'coverage', '.claude', '.github'])
const CORPUS_SKIP = new Set(['test', 'docs', 'scripts'])
const BUNDLE_DIRS = new Set(['_i18n', 'i18n'])
const SOURCE_EXT = new Set(['.cds', '.js', '.ts', '.json', '.xml', '.html', '.yaml', '.yml'])
const FILE_RE = /^(.+?)(?:_([a-z]{2,3}(?:_[A-Za-z0-9]+)*))?\.properties$/

const rel = p => path.relative(ROOT, p) || '.'
const problems = []
const error = (where, msg) => problems.push({ level: 'ERROR', where, msg })
const warn = (where, msg) => problems.push({ level: 'WARN', where, msg })

function walk (dir, visit, skip = new Set()) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (IGNORE.has(e.name) || skip.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { visit(full, true); walk(full, visit, skip) } else visit(full, false)
  }
}

function unescapeValue (s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\([tnrf])/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', f: '\f' })[c])
    .replace(/\\(.)/g, '$1')
}

function parseProperties (file) {
  const map = new Map()
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, '')
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const lineNo = i + 1
    // A trailing odd number of backslashes continues the value on the next line.
    while (((line.match(/\\+$/) || [''])[0].length % 2) === 1 && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].replace(/^\s+/, '')
    }
    const km = line.match(/^((?:\\.|[^\s=:\\])+)/)
    if (!km) continue
    const key = unescapeValue(km[1])
    const value = unescapeValue(line.slice(km[1].length).replace(/^\s*[=:]?\s*/, ''))
    if (map.has(key)) error(`${rel(file)}:${lineNo}`, `duplicate key "${key}"`)
    map.set(key, value)
  }
  return map
}

const placeholders = v => (v.match(/\{[A-Za-z0-9_.]+\}/g) || []).sort().join(' ')
const list = (items, max = 12) =>
  items.slice(0, max).join(', ') + (items.length > max ? `, ... (+${items.length - max} more)` : '')

// 1. Find bundle folders
const bundleDirs = []
walk(ROOT, (p, isDir) => { if (isDir && BUNDLE_DIRS.has(path.basename(p))) bundleDirs.push(p) })
if (!bundleDirs.length) warn('.', 'no _i18n/ or i18n/ folders found')

const requiredLangs = LANGS.filter(l => l !== DEFAULT_LANG)
const allDefaultKeys = [] // { key, where }

// 2. Check each bundle
for (const dir of bundleDirs) {
  const bundles = new Map() // base -> { def: file|null, langs: Map(lang -> file) }
  for (const f of fs.readdirSync(dir)) {
    const m = FILE_RE.exec(f)
    if (!m) continue
    const b = bundles.get(m[1]) || { def: null, langs: new Map() }
    if (m[2]) b.langs.set(m[2], path.join(dir, f)); else b.def = path.join(dir, f)
    bundles.set(m[1], b)
  }

  for (const [base, b] of bundles) {
    const where = `${rel(dir)}/${base}`
    if (!b.def) {
      error(where, `language files exist but ${base}.properties (default) is missing`)
      continue
    }
    const defMap = parseProperties(b.def)
    for (const k of defMap.keys()) allDefaultKeys.push({ key: k, where })
    for (const [k, v] of defMap) if (v.trim() === '') error(`${rel(b.def)}`, `empty value for "${k}"`)

    for (const lang of requiredLangs) {
      if (!b.langs.has(lang)) error(where, `missing file ${base}_${lang}.properties`)
    }
    for (const lang of b.langs.keys()) {
      if (lang !== DEFAULT_LANG && !LANGS.includes(lang)) {
        warn(where, `file for language "${lang}" found but "${lang}" is not in --languages; add it or remove the file`)
      }
    }

    for (const [lang, file] of b.langs) {
      const map = parseProperties(file)
      const missing = [...defMap.keys()].filter(k => !map.has(k))
      const extra = [...map.keys()].filter(k => !defMap.has(k))
      if (missing.length) error(rel(file), `${missing.length} key(s) missing vs default: ${list(missing)}`)
      if (extra.length) warn(rel(file), `${extra.length} key(s) not in default: ${list(extra)}`)
      for (const [k, v] of map) {
        if (v.trim() === '') error(rel(file), `empty value for "${k}"`)
        if (defMap.has(k) && placeholders(v) !== placeholders(defMap.get(k))) {
          error(rel(file), `placeholder mismatch for "${k}" (default: ${placeholders(defMap.get(k)) || 'none'}, ${lang}: ${placeholders(v) || 'none'})`)
        }
      }
    }
  }
}

// 3. Heuristic: default keys that no source file mentions
if (allDefaultKeys.length) {
  let corpus = ''
  walk(ROOT, (p, isDir) => {
    if (!isDir && SOURCE_EXT.has(path.extname(p))) {
      try { corpus += fs.readFileSync(p, 'utf8') + '\n' } catch { /* ignore */ }
    }
  }, CORPUS_SKIP)
  const unused = allDefaultKeys.filter(({ key }) => !corpus.includes(key))
  if (unused.length) {
    const byWhere = new Map()
    for (const u of unused) byWhere.set(u.where, [...(byWhere.get(u.where) || []), u.key])
    for (const [where, keys] of byWhere) {
      const msg = `${keys.length} key(s) not found in sources (may be used dynamically): ${list(keys)}`
      if (FAIL_ON_UNUSED) error(where, msg); else warn(where, msg)
    }
  }
}

// 4. Report
const errors = problems.filter(p => p.level === 'ERROR')
const warnings = problems.filter(p => p.level === 'WARN')
for (const p of [...errors, ...warnings]) console.log(`${p.level.padEnd(5)} ${p.where}: ${p.msg}`)
console.log(
  `\ni18n check: languages ${LANGS.join(', ')} (default ${DEFAULT_LANG}), ` +
  `${bundleDirs.length} folder(s), ${errors.length} error(s), ${warnings.length} warning(s)`
)
process.exit(errors.length ? 1 : 0)
