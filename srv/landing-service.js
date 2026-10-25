import cds from '@sap/cds'
import { restrictToNewArrivals, restrictToActiveDiscounts, noBestSellers } from './lib/landing.js'

export default class LandingService extends cds.ApplicationService {
  init () {
    const { NewArrivals, ActiveDiscounts, BestSellers } = this.entities
    this.before('READ', NewArrivals, restrictToNewArrivals)
    this.before('READ', ActiveDiscounts, restrictToActiveDiscounts)
    this.on('READ', BestSellers, noBestSellers)
    return super.init()
  }
}
