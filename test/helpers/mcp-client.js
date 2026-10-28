// Test helper for the MCP service BookAdminMcpService (served by @cap-js/mcp at POST /mcp/book-admin, no OData).
// Posts JSON-RPC 2.0 messages and parses the answer, which is either plain JSON or an SSE body ("event: message\ndata: {json}").
//
// How the adapter reports things (observed against the running test server):
//  - not authenticated -> HTTP 401, JSON-RPC error { code: -32001 }, no `result`
//  - authenticated without BookAdmin (bob, carol, gina, hugo, ivy) -> HTTP 403, JSON-RPC error { code: -32003 }, no `result`
//    (the whole service is gated by @requires: 'BookAdmin' before any tool runs, so describe, query and every action are denied alike)
//  - a tool that fails (validation, not found, status rule, bad or forbidden CQL, missing handler) -> HTTP 200 and a JSON-RPC `result`
//    with isError: true and a text content item "Error calling <tool>: <message>" (query: "Error executing CQL: ..."). It is NOT a
//    JSON-RPC error. The message is err.message of the service error. The adapter itself does not translate keyed messages (CAP does
//    that only in its OData error middleware), so the service does it with the request locale (srv/lib/mcp-admin.js, rejectKeyed):
//    the text is the translated message of messages_<lang>.properties. See failedWithText and test/i18n/book-admin-mcp-i18n.test.js.
//  - a tool that works -> HTTP 200, result.structuredContent = { action, kind, result } (actions) or { count, data } (query)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, userLang } from './order-review-fixtures.js'

export { user, userLang }
export const mcpPath = '/mcp/book-admin'
export const ORDER_ACTIONS = ['acceptOrder', 'rejectOrder', 'cancelOrder']
export const RETURN_ACTIONS = ['approveReturn', 'rejectReturn', 'cancelReturn']
export const ACTIONS = [...ORDER_ACTIONS, ...RETURN_ACTIONS]
export const TOOLS = ['describe', 'query', ...ACTIONS]

// Elements that must never be visible through this service (customer identity, ship-to address, customer comment, audit users, birth date)
export const PRIVATE = [
  'customer', 'customer_ID', 'shipToName', 'shipToStreet', 'shipToCity', 'shipToZip', 'shipToCountry', 'shipToCountry_code',
  'comment', 'createdBy', 'modifiedBy', 'dateOfBirth'
]

// All property names used anywhere in a JSON value
export function keysDeep (value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, found))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); keysDeep(v, found) }
  }
  return found
}
export const leaks = value => PRIVATE.filter(k => keysDeep(value).has(k))

// Parse an SSE or JSON body into the JSON-RPC message
export function parseRpc (data) {
  if (data && typeof data === 'object') return data
  const text = String(data ?? '')
  const lines = text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean)
  if (lines.length) return JSON.parse(lines[lines.length - 1])
  try { return JSON.parse(text) } catch { return { raw: text } }
}

// Client bound to a cds.test instance. `who` is a user name, undefined (anonymous) or an axios config { auth, headers }.
export function mcpClient ({ POST, GET }) {
  let id = 0
  const asConfig = who => {
    const base = typeof who === 'object' && who !== null ? who : user(who)
    // responseType text: the SSE answer would otherwise arrive as an unread stream
    return { ...base, responseType: 'text', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(base?.headers || {}) } }
  }

  // Raw JSON-RPC call: { status, rpc } where rpc is the parsed JSON-RPC message (result or error)
  const rpc = async (method, params, who) => {
    const res = await POST(mcpPath, { jsonrpc: '2.0', id: ++id, method, params }, asConfig(who))
    return { status: res.status, rpc: parseRpc(res.data) }
  }

  // Tool call: { status, error (JSON-RPC error), isError, text, data (structuredContent), result (action result) }
  const call = async (name, args = {}, who) => {
    const { status, rpc: msg } = await rpc('tools/call', { name, arguments: args }, who)
    const result = msg.result
    return {
      status,
      error: msg.error,
      isError: result?.isError === true,
      text: (result?.content || []).map(c => c.text).join('\n'),
      data: result?.structuredContent,
      result: result?.structuredContent?.result
    }
  }

  const list = async who => {
    const { status, rpc: msg } = await rpc('tools/list', {}, who)
    return { status, error: msg.error, tools: msg.result?.tools || [] }
  }
  const query = (cql, who) => call('query', { cql }, who)
  const describe = (args = {}, who) => call('describe', args, who)
  const initialize = who => rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'jest', version: '1.0.0' } }, who)
  const getRaw = who => GET(mcpPath, asConfig(who))

  return { rpc, call, list, query, describe, initialize, getRaw }
}

// ---- texts from _i18n (to compare with what the service answers) ----
const i18nDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../_i18n')

function bundle (file) {
  const out = {}
  const p = path.join(i18nDir, file)
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.]+)\s*=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// Text of a key in a language; `kind` is 'messages' (runtime messages) or 'i18n' (labels, MCP instructions). Falls back to English.
export function textOf (kind, key, lang = 'en') {
  const own = lang && lang !== 'en' ? bundle(`${kind}_${lang}.properties`)[key] : undefined
  return own ?? bundle(`${kind}.properties`)[key]
}

// Regex for a message template: placeholders {0} match anything
export function messageRegex (key, lang = 'en') {
  const template = textOf('messages', key, lang)
  if (!template) throw new Error(`no message ${key} for ${lang}`)
  const escaped = template.split(/\{\d+\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')
  return new RegExp(escaped)
}

// Text of a message with its placeholders filled ({0}, {1}, ...)
export const messageText = (key, lang = 'en', args = []) => textOf('messages', key, lang).replace(/\{(\d+)\}/g, (_m, i) => String(args[i]))

// Lenient variant: a failed tool call carries message KEY, as the raw key or as the English text. Use failedWithText where the
// translation itself matters.
export const failedWith = (res, KEY) => res.isError && (res.text.includes(KEY) || messageRegex(KEY, 'en').test(res.text))

// Strict variant: the call failed and the answer is the TRANSLATED text of KEY in `lang`, the raw key is not part of the message
// and no placeholder like {0} is left over, so an untranslated key or an unfilled placeholder can never pass.
export const failedWithText = (res, KEY, lang = 'en') => res.isError && messageRegex(KEY, lang).test(res.text) && !res.text.includes(KEY) && !/\{\d+\}/.test(res.text)
