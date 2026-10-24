using { bookstore } from '../db';

@requires: 'BookAdmin'
service AdminService {
  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'BookAdmin' }]
  entity Books as projection on bookstore.Books excluding { createdBy, modifiedBy };

  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity Authors as projection on bookstore.Authors excluding { createdBy, modifiedBy };
}
