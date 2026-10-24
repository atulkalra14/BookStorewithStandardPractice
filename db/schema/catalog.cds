using { cuid, managed } from '@sap/cds/common';

namespace bookstore;

entity Authors : cuid, managed {
  name        : String(111) @mandatory @title: '{i18n>AuthorName}';
  dateOfBirth : Date        @title: '{i18n>DateOfBirth}';
  books       : Association to many Books on books.author = $self;
}

entity Books : cuid, managed {
  title    : String(111)  @mandatory @title: '{i18n>Title}';
  author   : Association to Authors @mandatory @title: '{i18n>Author}';
  price    : Decimal(9,2) @assert.range: [0, 999999.99] @title: '{i18n>Price}';
  stock    : Integer      @assert.range: [0, 999999] @title: '{i18n>Stock}';
}

annotate Authors with @title: '{i18n>Authors}';
annotate Books   with @title: '{i18n>Books}';
