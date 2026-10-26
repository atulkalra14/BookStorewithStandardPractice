import cds from '@sap/cds'
import { rejectDeleteWithBooks, rejectMissingAuthor } from './lib/authors.js'
import { decide } from './lib/order-review.js'
import { decide as decideReturn } from './lib/return-review.js'

export default class AdminService extends cds.ApplicationService {
  init () {
    const { Authors, Books, Orders, Returns } = this.entities
    this.before('DELETE', Authors, req => rejectDeleteWithBooks(this, req))
    this.before('SAVE', Books, req => rejectMissingAuthor(this, req))
    for (const action of ['accept', 'reject', 'cancel']) this.on(action, Orders, req => decide(this, req, action))
    for (const action of ['approve', 'reject', 'cancel']) this.on(action, Returns, req => decideReturn(this, req, action))
    return super.init()
  }
}
