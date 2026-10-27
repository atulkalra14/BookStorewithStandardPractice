using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

namespace bookstore;

entity Authors : cuid, managed {
  name        : String(111) @mandatory @title: '{i18n>AuthorName}';
  dateOfBirth : Date        @title: '{i18n>DateOfBirth}';
  books       : Association to many Books on books.author = $self;
}

// Reference data (db/data), translatable through the generated Genres.texts entity.
entity Genres : CodeList {
  key code : String(30) @title: '{i18n>Genre}';
}

entity Books : cuid, managed {
  title    : String(111)  @mandatory @title: '{i18n>Title}';
  author   : Association to Authors @mandatory @title: '{i18n>Author}';
  descr    : localized String(1000) @title: '{i18n>Description}';
  price    : Decimal(9,2) @mandatory @assert.range: [0, 999999.99] @title: '{i18n>Price}';
  stock    : Integer      @mandatory @assert.range: [0, 999999] @title: '{i18n>Stock}';
  genre    : Association to Genres @assert.target @title: '{i18n>Genre}';  // optional: existing books have none
  imageUrl : String(500)  @assert.format: '^/(?!/)[\w/.-]+$' @title: '{i18n>CoverImage}';  // path to a static cover image, e.g. /com.bookstore.landing/images/covers/cover-1.svg
}

annotate Authors with @title: '{i18n>Authors}';
annotate Books   with @title: '{i18n>Books}';
annotate Genres  with @title: '{i18n>Genres}';
