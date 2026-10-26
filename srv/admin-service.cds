using { bookstore } from '../db';

@requires: 'BookAdmin'
service AdminService {
  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'BookAdmin' }]
  entity Books as projection on bookstore.Books excluding { createdBy, modifiedBy };

  // Editable like Books. An author that still has books cannot be deleted (handler, ERR_AUTHOR_HAS_BOOKS).
  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'BookAdmin' }]
  entity Authors as projection on bookstore.Authors excluding { createdBy, modifiedBy };

  // Value help for Books.genre: a code list, never edited by users, so no draft.
  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity Genres as projection on bookstore.Genres;

  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity Customers as projection on bookstore.Customers excluding { createdBy, modifiedBy };
}
