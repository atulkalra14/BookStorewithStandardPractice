// Separate from LandingService: a new user has no role yet, so only a successful login is required.
@requires: 'authenticated-user'
service RegistrationService {
  action registerCustomer(name : String(111), email : String(255)) returns { ID : UUID };
}
