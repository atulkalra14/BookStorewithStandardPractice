import cds from '@sap/cds'
import { restrictToNewArrivals, restrictToActiveDiscounts, selectDiscountInputs, addDiscountedPrice, noBestSellers } from './lib/landing.js'

export default class LandingService extends cds.ApplicationService {
  init () {
    const { NewArrivals, ActiveDiscounts, BestSellers } = this.entities
    this.before('READ', NewArrivals, restrictToNewArrivals)
    this.before('READ', ActiveDiscounts, restrictToActiveDiscounts)
    this.before('READ', ActiveDiscounts, selectDiscountInputs)
    this.after('READ', ActiveDiscounts, addDiscountedPrice)
    this.on('READ', BestSellers, noBestSellers)
    return super.init()
  }
}
