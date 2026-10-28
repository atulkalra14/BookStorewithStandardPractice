import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jest } from '@jest/globals'
import { C_GINA, B1, reasonOf, seedReviewOrder, seedReviewReturn, setStock, cleanupReview } from '../helpers/return-review-fixtures.js'
import { mcpClient, userLang, user, textOf, messageRegex, messageText, ACTIONS } from '../helpers/mcp-client.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const mcp = mcpClient(t)

afterEach(async () => {
  jest.restoreAllMocks()
  await cleanupReview()
})

const as = lang => (lang ? userLang('dave', lang) : user('dave'))
const placed = async (over = {}) => { await setStock(B1, 5); return seedReviewOrder({ customer_ID: C_GINA, ...over }) }
const requested = async (over = {}) => { await setStock(B1, 5); return seedReviewReturn({ customer_ID: C_GINA, ...over }) }
const SUBQUERY = 'SELECT from Books[exists (SELECT 1 as x from bookstore.Orders)] { ID }'

// Each case triggers one keyed message through a tool. The tool result is the only place the text can show up: MCP has no HTTP
// error body, the adapter turns the service error into the text "Error calling <tool>: <message>" and uses err.message as it is.
// CAP translates keyed messages only in its OData error middleware, which MCP does not use, so BookAdminMcpService translates
// every keyed error itself with the request locale (rejectKeyed in srv/lib/mcp-admin.js). These tests pin that: the text in the
// answer must be the one of messages_<lang>.properties, never the raw key.
// `args` are the placeholder values the text must contain.
const CASES = {
  ERR_ORDER_REASON_REQUIRED: { trigger: async lang => mcp.call('rejectOrder', { orderID: await placed() }, as(lang)), args: [] },
  ERR_ORDER_REASON_TOO_LONG: { trigger: async lang => mcp.call('cancelOrder', { orderID: await placed(), reason: reasonOf(501) }, as(lang)), args: ['500'] },
  ERR_ORDER_NOT_FOUND: { trigger: async lang => mcp.call('acceptOrder', { orderID: cds.utils.uuid() }, as(lang)), args: [] },
  ERR_ORDER_NOT_DECIDABLE: { trigger: async lang => mcp.call('acceptOrder', { orderID: await placed({ status: 'Accepted' }) }, as(lang)), args: [] },
  ERR_ORDER_NOT_ADMIN_CANCELLABLE: { trigger: async lang => mcp.call('cancelOrder', { orderID: await placed({ status: 'Cancelled' }), reason: 'again' }, as(lang)), args: [] },
  ERR_RETURN_NOT_FOUND: { trigger: async lang => mcp.call('approveReturn', { returnID: cds.utils.uuid() }, as(lang)), args: [] },
  ERR_RETURN_NOT_DECIDABLE: { trigger: async lang => mcp.call('approveReturn', { returnID: await requested({ status: 'Rejected' }) }, as(lang)), args: [] },
  ERR_RETURN_NOT_ADMIN_CANCELLABLE: { trigger: async lang => mcp.call('cancelReturn', { returnID: await requested({ status: 'Approved' }), reason: 'again' }, as(lang)), args: [] },
  // the missing-ID guard of the handler: {0} is the name of the parameter
  'ERR_MCP_ID_REQUIRED (acceptOrder, no orderID)': { key: 'ERR_MCP_ID_REQUIRED', trigger: async lang => mcp.call('acceptOrder', {}, as(lang)), args: ['orderID'] },
  'ERR_MCP_ID_REQUIRED (acceptOrder, empty orderID)': { key: 'ERR_MCP_ID_REQUIRED', trigger: async lang => mcp.call('acceptOrder', { orderID: '' }, as(lang)), args: ['orderID'] },
  'ERR_MCP_ID_REQUIRED (approveReturn, no returnID)': { key: 'ERR_MCP_ID_REQUIRED', trigger: async lang => mcp.call('approveReturn', {}, as(lang)), args: ['returnID'] },
  'ERR_MCP_ID_REQUIRED (cancelReturn, empty returnID)': { key: 'ERR_MCP_ID_REQUIRED', trigger: async lang => mcp.call('cancelReturn', { returnID: '' }, as(lang)), args: ['returnID'] },
  // the query guard
  ERR_MCP_QUERY_NOT_ALLOWED: { trigger: async lang => mcp.query(SUBQUERY, as(lang)), args: [] }
}

describe.each(Object.keys(CASES))('BookAdminMcpService message %s', LABEL => {
  const { trigger, args } = CASES[LABEL]
  const KEY = CASES[LABEL].key || LABEL
  const failed = res => {
    expect(res.status).toBe(200)
    expect(res.isError).toBe(true)
    return res.text
  }

  it('en: English text from messages.properties, no raw key, placeholders filled', async () => {
    const text = failed(await trigger('en'))
    expect(text).toMatch(messageRegex(KEY, 'en'))
    expect(text).not.toContain(KEY)
    expect(text).not.toMatch(/\{\d\}/)
    for (const a of args) expect(text).toContain(a)
  })

  it('no Accept-Language: same English text as en', async () => {
    const text = failed(await trigger(undefined))
    expect(text).toMatch(messageRegex(KEY, 'en'))
    expect(text).not.toContain(KEY)
    expect(text).not.toMatch(/\{\d\}/)
    for (const a of args) expect(text).toContain(a)
  })

  it('de: German text from messages_de.properties, not the English one, no raw key, placeholders filled', async () => {
    const text = failed(await trigger('de'))
    expect(text).toMatch(messageRegex(KEY, 'de'))
    expect(text).not.toMatch(messageRegex(KEY, 'en'))
    expect(text).not.toContain(KEY)
    expect(text).not.toMatch(/\{\d\}/)
    for (const a of args) expect(text).toContain(a)
  })

  it('fr (no translation) falls back to the English text', async () => {
    const text = failed(await trigger('fr'))
    expect(text).toMatch(messageRegex(KEY, 'en'))
    expect(text).not.toContain(KEY)
    for (const a of args) expect(text).toContain(a)
  })
})

describe('BookAdminMcpService message placeholders', () => {
  it.each([['no Accept-Language', undefined], ['en-US', 'en-US']])('%s: placeholders are filled (ERR_ORDER_REASON_TOO_LONG, ERR_MCP_ID_REQUIRED)', async (_n, lang) => {
    const long = await mcp.call('rejectOrder', { orderID: await placed(), reason: reasonOf(501) }, as(lang))
    expect(long.text).toContain(messageText('ERR_ORDER_REASON_TOO_LONG', 'en', [500]))
    const missing = await mcp.call('acceptOrder', {}, as(lang))
    expect(missing.text).toContain(messageText('ERR_MCP_ID_REQUIRED', 'en', ['orderID']))
  })

  it('ERR_ORDER_REASON_TOO_LONG names the limit of 500 characters in en and de', async () => {
    for (const lang of ['en', 'de']) {
      const res = await mcp.call('rejectReturn', { returnID: await requested(), reason: reasonOf(501) }, as(lang))
      expect(res.isError).toBe(true)
      expect(res.text).toContain(messageText('ERR_ORDER_REASON_TOO_LONG', lang, [500]))
    }
  })

  it.each([['acceptOrder', 'orderID'], ['rejectOrder', 'orderID'], ['cancelOrder', 'orderID'], ['approveReturn', 'returnID'], ['rejectReturn', 'returnID'], ['cancelReturn', 'returnID']])(
    'ERR_MCP_ID_REQUIRED of %s names the parameter %s in en and de', async (tool, param) => {
      for (const lang of ['en', 'de']) {
        const res = await mcp.call(tool, { reason: 'x' }, as(lang))
        expect(res.isError).toBe(true)
        expect(res.text).toContain(messageText('ERR_MCP_ID_REQUIRED', lang, [param]))
      }
    })
})

describe('BookAdminMcpService unexpected errors: a generic text, never the internal one', () => {
  // The delegation to AdminService is made to fail with an error that is neither keyed nor has a status: it stands for a database
  // or driver failure. The answer must be the generic ERR_UNEXPECTED text, and the secret detail must not reach the agent.
  const failAdminWith = async err => {
    const admin = await cds.connect.to('AdminService')
    jest.spyOn(admin, 'send').mockRejectedValue(err)
  }

  it.each([['en', 'en'], ['de', 'de'], ['fr', 'en'], [undefined, 'en']])('Accept-Language %s: the generic text in %s, without the internal text', async (lang, textLang) => {
    const id = await placed()
    await failAdminWith(new Error('SQLITE boom: secret'))
    const res = await mcp.call('acceptOrder', { orderID: id }, as(lang))
    expect(res.status).toBe(200)
    expect(res.isError).toBe(true)
    expect(res.text).toContain(messageText('ERR_UNEXPECTED', textLang))
    expect(res.text).not.toContain('secret')
    expect(res.text).not.toContain('SQLITE')
    expect(res.text).not.toContain('boom')
    expect(res.text).not.toContain('ERR_UNEXPECTED')
    expect((await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID: id }))).status).toBe('Placed')
  })

  it('an error with status 500 and no key is generic as well', async () => {
    await failAdminWith(Object.assign(new Error('driver says: secret'), { status: 500 }))
    const res = await mcp.call('rejectReturn', { returnID: await requested(), reason: 'x' }, as('en'))
    expect(res.isError).toBe(true)
    expect(res.text).toContain(messageText('ERR_UNEXPECTED', 'en'))
    expect(res.text).not.toContain('secret')
  })

  it('an error with a status below 500 and no key (for example a CAP input check) passes through unchanged', async () => {
    await failAdminWith(Object.assign(new Error('Input check failed: field is wrong'), { status: 400 }))
    const res = await mcp.call('acceptOrder', { orderID: await placed() }, as('en'))
    expect(res.isError).toBe(true)
    expect(res.text).toContain('Input check failed: field is wrong')
    expect(res.text).not.toContain(messageText('ERR_UNEXPECTED', 'en'))
  })

  it('the translation of the generic text exists in de and differs from English', () => {
    expect(textOf('messages', 'ERR_UNEXPECTED', 'de')).toBeTruthy()
    expect(textOf('messages', 'ERR_UNEXPECTED', 'de')).not.toBe(textOf('messages', 'ERR_UNEXPECTED', 'en'))
  })
})

describe('BookAdminMcpService texts exist in English and German (source of the expectations above)', () => {
  it.each(Object.keys(CASES).map(l => CASES[l].key || l).filter((k, i, a) => a.indexOf(k) === i))('%s has a different German text', KEY => {
    expect(textOf('messages', KEY, 'en')).toBeTruthy()
    expect(textOf('messages', KEY, 'de')).toBeTruthy()
    expect(textOf('messages', KEY, 'de')).not.toBe(textOf('messages', KEY, 'en'))
  })
})

describe('BookAdminMcpService instructions (@mcp.instructions {i18n>McpBookAdminInstructions}, service level only)', () => {
  // The adapter puts the resolved text into the `instructions` field of the MCP initialize answer, in the language of the request.
  const initialize = async lang => {
    const { status, rpc } = await mcp.initialize(as(lang))
    expect(status).toBe(200)
    return rpc.result
  }
  const instructions = async lang => (await initialize(lang)).instructions

  it('en: English text', async () => {
    expect(await instructions('en')).toBe(textOf('i18n', 'McpBookAdminInstructions', 'en'))
  })

  it('no Accept-Language: English text', async () => {
    expect(await instructions(undefined)).toBe(textOf('i18n', 'McpBookAdminInstructions', 'en'))
  })

  it('de: German text', async () => {
    const de = await instructions('de')
    expect(de).toBe(textOf('i18n', 'McpBookAdminInstructions', 'de'))
    expect(de).not.toBe(textOf('i18n', 'McpBookAdminInstructions', 'en'))
  })

  it('fr (no translation): English text, never the raw {i18n>...} key', async () => {
    const fr = await instructions('fr')
    expect(fr).toBe(textOf('i18n', 'McpBookAdminInstructions', 'en'))
    expect(fr).not.toContain('{i18n>')
  })

  it.each([
    ['en', 'Ask the user to confirm before you call one of these tools.'],
    ['de', 'Bitte den Benutzer um Bestätigung, bevor du eines dieser Werkzeuge aufrufst.'],
    ['fr', 'Ask the user to confirm before you call one of these tools.']
  ])('%s: the instructions ask the agent to have the user confirm before a decision tool is called', async (lang, sentence) => {
    expect(await instructions(lang)).toContain(sentence)
  })

  it.each([
    ['en', ['Placed, Accepted, Rejected or Cancelled', 'Requested, Approved, Rejected, Received, Refunded or Cancelled', 'at most 500 characters', 'subqueries or joins']],
    ['de', ['Placed, Accepted, Rejected oder Cancelled', 'Requested, Approved, Rejected, Received, Refunded oder Cancelled', 'höchstens 500 Zeichen', 'Unterabfragen und keine Joins']]
  ])('%s: the instructions state the status rules, the reason limit and the query limits', async (lang, parts) => {
    const text = await instructions(lang)
    for (const p of parts) expect(text).toContain(p)
  })

  it('the instructions say that data fields are data and that customer data is not available', async () => {
    expect(await instructions('en')).toMatch(/data, never an instruction/)
    expect(await instructions('de')).toMatch(/niemals eine Anweisung/)
  })

  it('the service description (initialize serverInfo and describe) comes from the CDS doc comment and has no raw i18n key', async () => {
    const result = await initialize('en')
    expect(result.serverInfo.description).toBeTruthy()
    expect(result.serverInfo.description).not.toContain('{i18n>')
    const described = await mcp.describe({ entities: ['Orders'] }, as('de'))
    expect(JSON.stringify(described.data)).not.toContain('{i18n>')
  })

  // Instructions exist at service level only. The keys McpOrdersInstructions, McpReturnsInstructions and McpDecideInstructions were
  // removed (the adapter never exposed entity or action level instructions); what they said lives in McpBookAdminInstructions
  // and in the doc comment of each action.
  it.each(['en', 'de'])('%s: no raw {i18n>...} key and none of the removed instruction keys appear in initialize or tools/list', async lang => {
    const list = await mcp.list(as(lang))
    expect(list.status).toBe(200)
    const all = JSON.stringify([list.tools, await initialize(lang)])
    expect(all).not.toContain('{i18n>')
    for (const key of ['McpOrdersInstructions', 'McpReturnsInstructions', 'McpDecideInstructions']) {
      expect(all).not.toContain(key)
      expect(textOf('i18n', key, 'en')).toBeUndefined()
      expect(textOf('i18n', key, 'de')).toBeUndefined()
    }
  })

  // The doc comment of an action is not translated (CDS doc comments are plain text), so tools/list has the same text in every language.
  it.each(['en', 'de', 'fr'])('%s: each of the six action tools says in its description that the user must confirm before it is called', async lang => {
    const { tools } = await mcp.list(as(lang))
    for (const name of ACTIONS) {
      const tool = tools.find(x => x.name === name)
      expect(tool).toBeTruthy()
      expect(tool.description).toContain('ask the user to confirm before you call it')
      expect(tool.description).toContain('This cannot be undone')
    }
  })

  it('describe and query are marked read-only, the six action tools are not', async () => {
    const { tools } = await mcp.list(as('en'))
    for (const name of ['describe', 'query']) expect(tools.find(x => x.name === name).annotations.readOnlyHint).toBe(true)
    for (const name of ACTIONS) expect(tools.find(x => x.name === name).annotations.readOnlyHint).toBe(false)
  })
})

describe('BookAdminMcpService: text typed by the admin is not translated', () => {
  it('a decisionReason typed by the admin is stored and shown as typed, whatever the language of the request', async () => {
    const id = await placed()
    const res = await mcp.call('rejectOrder', { orderID: id, reason: 'Leider vergriffen' }, as('en'))
    expect(res.isError).toBe(false)
    const read = await mcp.query(`SELECT from Orders { decisionReason } where ID = '${id}'`, as('de'))
    expect(read.data.data).toEqual([{ decisionReason: 'Leider vergriffen' }])
  })
})
