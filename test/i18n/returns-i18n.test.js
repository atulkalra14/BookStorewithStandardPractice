import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, userLang, O_GINA, O_GINA_OLD, O_GINA_CANCELLED, I_G1, I_G2, I_G_EDGE, draftKey,
  resetReturns, insertReturn, returnApi, code, msg
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = returnApi(t)
const item = (orderItem_ID, quantity) => ({ orderItem_ID, quantity, reason_code: 'Damaged' })

beforeEach(resetReturns)

// Each scenario returns the failing response for the given language.
const scenarios = {
  ERR_RETURN_EMPTY: async l => { const u = userLang('gina', l); return api.activate(await api.returnWith(u, O_GINA, []), u) },
  ERR_RETURN_ORDER_NOT_ELIGIBLE: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.returnWith(u, O_GINA_CANCELLED, [item('e1000000-0000-4000-8000-000000000004', 1)]), u)
  },
  ERR_RETURN_WINDOW_EXPIRED: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.returnWith(u, O_GINA_OLD, [item('e1000000-0000-4000-8000-000000000003', 1)]), u)
  },
  ERR_RETURN_ITEM_NOT_IN_ORDER: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.returnWith(u, O_GINA, [item(I_G_EDGE, 1)]), u)
  },
  ERR_RETURN_DUPLICATE_ITEM: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.returnWith(u, O_GINA, [item(I_G1, 1), item(I_G1, 1)]), u)
  },
  ERR_RETURN_QUANTITY_INVALID: async l => {
    const u = userLang('gina', l)
    const id = await api.returnWith(u, O_GINA, [])
    const add = await api.addItem(id, item(I_G1, 0), u)
    return add.status >= 400 ? add : api.activate(id, u)
  },
  ERR_RETURN_QUANTITY_EXCEEDS: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.returnWith(u, O_GINA, [item(I_G2, 3)]), u)
  },
  ERR_RETURN_NOT_EDITABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.submit(u, O_GINA, [item(I_G1, 1)])
    return api.PATCH(`${base}/Returns(ID=${id},IsActiveEntity=true)`, { comment: 'X' }, u)
  },
  ERR_RETURN_NOT_DELETABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.submit(u, O_GINA, [item(I_G1, 1)])
    return api.DELETE(`${base}/Returns(ID=${id},IsActiveEntity=true)`, u)
  },
  ERR_RETURN_NOT_CANCELLABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.submit(u, O_GINA, [item(I_G1, 1)])
    await api.cancel(id, u)
    return api.cancel(id, u)
  },
  ERR_RETURN_ITEM_PARENT_IMMUTABLE: async l => {
    const u = userLang('gina', l)
    const a = await api.returnWith(u, O_GINA, [item(I_G1, 1)])
    const b = await api.returnWith(u, O_GINA, [])
    const itemId = (await api.GET(`${base}/${draftKey(a)}/items`, u)).data.value[0].ID
    return api.PATCH(`${base}/ReturnItems(ID=${itemId},IsActiveEntity=false)`, { return_ID: b }, u)
  }
}

describe.each(Object.keys(scenarios))('ReturnService message %s', key => {
  it('en: 400 with the key as code and a resolved English text', async () => {
    const res = await scenarios[key]('en')
    expect(res.status).toBe(400)
    expect(code(res)).toBe(key)
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain(key)
    expect(msg(res)).not.toMatch(/\{\d\}/)
  })
  it('de: German text that differs from English, no unresolved placeholder', async () => {
    const en = await scenarios[key]('en')
    await resetReturns()
    const de = await scenarios[key]('de')
    expect(de.status).toBe(400)
    expect(code(de)).toBe(key)
    expect(msg(de)).not.toContain(key)
    expect(msg(de)).not.toMatch(/\{\d\}/)
    expect(msg(de)).not.toBe(msg(en))
  })
  it('fr falls back to the English text', async () => {
    const en = await scenarios[key]('en')
    await resetReturns()
    const fr = await scenarios[key]('fr')
    expect(code(fr)).toBe(key)
    expect(msg(fr)).toBe(msg(en))
  })
})

describe('message arguments', () => {
  it.each(['en', 'de'])('ERR_RETURN_WINDOW_EXPIRED %s: the message contains the window of 30 days', async l => {
    expect(msg(await scenarios.ERR_RETURN_WINDOW_EXPIRED(l))).toContain('30')
  })
  it.each(['en', 'de'])('ERR_RETURN_QUANTITY_EXCEEDS %s: the message contains book title and available quantity', async l => {
    const m = msg(await scenarios.ERR_RETURN_QUANTITY_EXCEEDS(l))
    expect(m).toContain('Test Book Three')
    expect(m).toContain('2')
  })
  it('ERR_RETURN_QUANTITY_EXCEEDS available quantity respects quantities in other returns', async () => {
    await insertReturn({ order_ID: O_GINA, status: 'Approved', lines: [{ orderItem_ID: I_G2, quantity: 1 }] })
    expect(msg(await scenarios.ERR_RETURN_QUANTITY_EXCEEDS('en'))).toMatch(/\b1\b/)
  })
})

describe('ReturnService not found messages', () => {
  it('a foreign return is 404 (de and en) without leaking the owner', async () => {
    const owner = userLang('gina', 'en')
    const id = await api.submit(owner, O_GINA, [item(I_G1, 1)])
    for (const l of ['en', 'de']) {
      const res = await api.cancel(id, userLang('hugo', l))
      expect(res.status).toBe(404)
      expect(JSON.stringify(res.data)).not.toContain('gina')
    }
  })
  it('a lock on another customer draft is reported as 404 in the language of the request, without the lock holder', async () => {
    const id = await api.returnWith(userLang('gina', 'en'), O_GINA, [item(I_G1, 1)])
    const en = await api.PATCH(`${base}/${draftKey(id)}`, { comment: 'x' }, userLang('hugo', 'en'))
    const de = await api.PATCH(`${base}/${draftKey(id)}`, { comment: 'x' }, userLang('hugo', 'de'))
    expect(en.status).toBe(404)
    expect(de.status).toBe(404)
    for (const res of [en, de]) {
      expect(JSON.stringify(res.data)).not.toContain('DRAFT_LOCKED_BY_ANOTHER_USER')
      expect(JSON.stringify(res.data)).not.toContain('gina')
    }
  })
})

describe('localized ReturnReasons', () => {
  const names = async lang => {
    const res = await api.GET(`${base}/ReturnReasons`, userLang('gina', lang))
    expect(res.status).toBe(200)
    return Object.fromEntries(res.data.value.map(r => [r.code, r.name]))
  }
  const CODES = ['Damaged', 'WrongItem', 'NotAsDescribed', 'NoLongerNeeded', 'Other']

  it('English names exist for all five codes', async () => {
    const en = await names('en')
    for (const c of CODES) expect(en[c]).toBeTruthy()
  })
  it.each(CODES)('de: %s has a German name that differs from the English one', async c => {
    const [en, de] = [await names('en'), await names('de')]
    expect(de[c]).toBeTruthy()
    expect(de[c]).not.toBe(en[c])
  })
  it('another language (fr) falls back to the English names', async () => {
    const [en, fr] = [await names('en'), await names('fr')]
    for (const c of CODES) expect(fr[c]).toBe(en[c])
  })
})

describe('ReturnService $metadata labels', () => {
  it('de labels differ from en', async () => {
    const en = await api.GET(`${base}/$metadata`, userLang('gina', 'en'))
    const de = await api.GET(`${base}/$metadata`, userLang('gina', 'de'))
    expect(en.status).toBe(200)
    expect(de.data).not.toBe(en.data)
  })
})
