import cds from '@sap/cds'
import { validateRegistration, registerCustomer, hideSubmittedValue } from './lib/landing.js'

export default class RegistrationService extends cds.ApplicationService {
  init () {
    this.before('registerCustomer', validateRegistration)
    this.on('registerCustomer', registerCustomer)
    this.on('error', hideSubmittedValue)
    return super.init()
  }
}
