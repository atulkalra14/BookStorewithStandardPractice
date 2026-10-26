using { bookstore } from '../db';

@requires: 'BookViewer'
service CatalogService {
  @readonly entity Books   as projection on bookstore.Books   excluding { createdBy, modifiedBy };
  @readonly entity Authors as projection on bookstore.Authors excluding { createdBy, modifiedBy };
  @readonly entity Genres  as projection on bookstore.Genres;
}
