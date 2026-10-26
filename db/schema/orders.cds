using { cuid, managed, Country } from '@sap/cds/common';
using { bookstore.Books } from './catalog';
using { bookstore.Customers } from './customers';

namespace bookstore;

// Placed -> Accepted or Rejected (shop decision, AdminService); Placed or Accepted -> Cancelled (customer while Placed,
// shop until delivery). Rejected and Cancelled orders have given their stock back.
type OrderStatus : String(10) enum {
  Placed;
  Accepted;
  Rejected;
  Cancelled;
}

// An Order is edited as a draft (the cart) until it is activated; activation places the order.
entity Orders : cuid, managed {
  orderNumber  : String(20)     @readonly @title: '{i18n>OrderNumber}';  // generated on placement in srv/lib/orders.js
  customer     : Association to Customers @readonly @title: '{i18n>Customer}';
  status       : OrderStatus    @readonly @title: '{i18n>OrderStatus}';
  items        : Composition of many OrderItems on items.order = $self;
  totalAmount  : Decimal(11,2)  @readonly @title: '{i18n>TotalAmount}';  // sum of item line totals, recalculated by the handler
  currency     : String(3)      @readonly @title: '{i18n>Currency}';     // fixed 'EUR' until Books gets a currency
  placedAt     : Timestamp      @readonly @title: '{i18n>PlacedAt}';
  deliveredAt  : Timestamp      @readonly @title: '{i18n>DeliveredAt}';  // set by seed data only until a fulfilment slice exists; starts the return window
  decisionReason: String(500)   @readonly @title: '{i18n>DecisionReason}';  // shop's reason, shown to the customer; set by the admin actions
  decidedAt    : Timestamp      @readonly @title: '{i18n>DecidedAt}';       // when the shop accepted, rejected or cancelled
  shipToName   : String(111)    @mandatory @title: '{i18n>ShipToName}';
  shipToStreet : String(111)    @mandatory @title: '{i18n>ShipToStreet}';
  shipToCity   : String(60)     @mandatory @title: '{i18n>ShipToCity}';   // Essen only for now, checked in srv/lib/orders.js
  shipToZip    : String(5)      @mandatory @title: '{i18n>ShipToZip}';    // must exist in PostalCodes, checked in srv/lib/orders.js
  shipToCountry: Country        @mandatory @title: '{i18n>ShipToCountry}';  // code list sap.common.Countries (ISO 3166-1 alpha-2), element shipToCountry_code
}

entity OrderItems : cuid {
  order     : Association to Orders;
  book      : Association to Books @mandatory @title: '{i18n>Book}';
  quantity  : Integer       @mandatory @title: '{i18n>Quantity}';  // range 1..99 checked in srv/lib/orders.js (keyed, translated message)
  unitPrice : Decimal(9,2)  @readonly @title: '{i18n>UnitPrice}';   // price snapshot taken from Books on placement
  lineTotal : Decimal(11,2) @readonly @title: '{i18n>LineTotal}';   // quantity * unitPrice, set by the handler
}

annotate Orders     with @title: '{i18n>Orders}'
                         @assert.unique.orderNumber: [ orderNumber ];
annotate OrderItems with @title: '{i18n>OrderItems}';

annotate Orders with @PersonalData: { EntitySemantics: 'Other' } {
  customer      @PersonalData.FieldSemantics: 'DataSubjectID';
  decisionReason @PersonalData.IsPotentiallyPersonal;  // free text typed by the shop, may name the customer
  shipToName    @PersonalData.IsPotentiallyPersonal;
  shipToStreet  @PersonalData.IsPotentiallyPersonal;
  shipToCity    @PersonalData.IsPotentiallyPersonal;
  shipToZip     @PersonalData.IsPotentiallyPersonal;
  shipToCountry @PersonalData.IsPotentiallyPersonal;
};
