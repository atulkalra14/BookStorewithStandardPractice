import cds from '@sap/cds'
import { restrictToNewArrivals, restrictToActiveDiscounts, selectDiscountInputs, addDiscountedPrice } from './lib/landing.js'
import { bestSellers, addBestSellerDescriptions } from './lib/orders.js'

export default class LandingService extends cds.ApplicationService {
  init () {
    const { NewArrivals, ActiveDiscounts, BestSellers } = this.entities
    this.before('READ', NewArrivals, restrictToNewArrivals)
    this.before('READ', ActiveDiscounts, restrictToActiveDiscounts)
    this.before('READ', ActiveDiscounts, selectDiscountInputs)
    this.after('READ', ActiveDiscounts, addDiscountedPrice)
    this.on('READ', BestSellers, bestSellers)
    this.after('READ', BestSellers, addBestSellerDescriptions)
    this.on('isBookAdmin', req => req.user.is('BookAdmin'))
    return super.init()
  }
}
