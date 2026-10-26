import cds from '@sap/cds'
import { rejectDeleteWithBooks, rejectMissingAuthor } from './lib/authors.js'

export default class AdminService extends cds.ApplicationService {
  init () {
    const { Authors, Books } = this.entities
    this.before('DELETE', Authors, req => rejectDeleteWithBooks(this, req))
    this.before('SAVE', Books, req => rejectMissingAuthor(this, req))
    return super.init()
  }
}
