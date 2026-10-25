using { cuid, managed } from '@sap/cds/common';
using { bookstore } from './catalog';

namespace bookstore;

// Landing page content. Discounts reference books. The landing page expects a single StoreInfo record per tenant;
// this is not enforced, the record is maintained through seed data until an admin app exists.
entity Discounts : cuid, managed {
  book        : Association to bookstore.Books @mandatory @title: '{i18n>Book}';
  percent     : Integer @mandatory @assert.range: [1, 90] @title: '{i18n>DiscountPercent}';
  validFrom   : Date    @mandatory @title: '{i18n>ValidFrom}';
  validTo     : Date    @mandatory @title: '{i18n>ValidTo}';
  description : localized String(255) @title: '{i18n>Description}';
}

entity StoreInfo : cuid, managed {
  name         : String(111) @mandatory @title: '{i18n>StoreName}';
  address      : String(255) @title: '{i18n>Address}';
  phone        : String(40)  @title: '{i18n>Phone}';
  openingHours : localized String(255) @title: '{i18n>OpeningHours}';
  description  : localized String(1000) @title: '{i18n>Description}';
  heroImageUrl : String(500) @assert.format: '^/(?!/)[\w/.-]+$' @title: '{i18n>HeroImage}';  // banner on the landing page, static image path
}

// Applies to every service entity that allows writes on Discounts (none yet: read-only landing page).
annotate Discounts with {
  validTo @assert: (case when validTo < validFrom then 'ERR_DISCOUNT_RANGE' end);
};

annotate Discounts with @title: '{i18n>Discounts}';
annotate StoreInfo with @title: '{i18n>StoreInfo}';
