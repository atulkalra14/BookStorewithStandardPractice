import cds from '@sap/cds'
import { restrictToNewArrivals, restrictToActiveDiscounts, selectDiscountInputs, addDiscountedPrice } from './lib/landing.js'
import { bestSellers } from './lib/orders.js'

export default class LandingService extends cds.ApplicationService {
  init () {
    const { NewArrivals, ActiveDiscounts, BestSellers } = this.entities
    this.before('READ', NewArrivals, restrictToNewArrivals)
    this.before('READ', ActiveDiscounts, restrictToActiveDiscounts)
    this.before('READ', ActiveDiscounts, selectDiscountInputs)
    this.after('READ', ActiveDiscounts, addDiscountedPrice)
    this.on('READ', BestSellers, bestSellers)
    return super.init()
  }
}
