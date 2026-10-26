using { cuid, managed, Country } from '@sap/cds/common';
using { bookstore.Customers } from './customers';

namespace bookstore;

// Delivery is limited to Essen (North Rhine-Westphalia) for now: this code list feeds the postal code search help.
entity PostalCodes {
  key code      : String(5)   @title: '{i18n>PostalCode}';
      city      : String(60)  @title: '{i18n>City}';       // always 'Essen' for now
      districts : String(255) @title: '{i18n>Districts}';  // Stadtteile, comma-separated (search help text only)
}

annotate PostalCodes with @title: '{i18n>PostalCodes}' @cds.autoexpose;

// A customer's saved ship-to address. Orders keep their own inline shipTo* copy (a snapshot), so editing an address
// never changes a placed order. customer is set and protected by the handler, not @readonly: CAP drops readonly input
// silently, and a change must be rejected (ERR_ADDRESS_CUSTOMER_IMMUTABLE). Rules (country, postal code, city) are checked in srv/lib/addresses.js.
entity CustomerAddresses : cuid, managed {
  customer   : Association to Customers @title: '{i18n>Customer}';
  label      : String(40)   @title: '{i18n>AddressLabel}';
  name       : String(111)  @mandatory @title: '{i18n>ShipToName}';
  street     : String(111)  @mandatory @title: '{i18n>ShipToStreet}';
  city       : String(60)   @mandatory @title: '{i18n>ShipToCity}';
  zip        : String(5)    @mandatory @title: '{i18n>ShipToZip}';
  country    : Country      @mandatory @title: '{i18n>ShipToCountry}';
  isDefault  : Boolean default false @title: '{i18n>IsDefault}';
  lastUsedAt : Timestamp    @readonly @title: '{i18n>LastUsedAt}';  // set when an order is placed with this address
}

annotate CustomerAddresses with @title: '{i18n>CustomerAddresses}';

annotate CustomerAddresses with @PersonalData: { EntitySemantics: 'Other' } {
  customer @PersonalData.FieldSemantics: 'DataSubjectID';
  name     @PersonalData.IsPotentiallyPersonal;
  street   @PersonalData.IsPotentiallyPersonal;
  city     @PersonalData.IsPotentiallyPersonal;
  zip      @PersonalData.IsPotentiallyPersonal;
  country  @PersonalData.IsPotentiallyPersonal;
};
