import cds from '@sap/cds'
import { invoiceFor } from './lib/invoice.js'

export default class PurchaseHistoryService extends cds.ApplicationService {
  init () {
    const { Orders } = this.entities
    this.on('invoice', Orders, req => invoiceFor(this, req))
    return super.init()
  }
}
