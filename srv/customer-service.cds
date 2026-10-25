using { bookstore } from '../db';

@requires: 'Customer'
service CustomerService {
  @odata.draft.enabled
  @restrict: [{ grant: ['READ', 'UPDATE'], to: 'Customer', where: 'userId = $user' }]
  entity Customers as projection on bookstore.Customers excluding { createdBy, modifiedBy };
}
