using { cuid, managed } from '@sap/cds/common';

namespace bookstore;

entity Customers : cuid, managed {
  name   : String(111)  @mandatory @title: '{i18n>CustomerName}';
  email  : String(255)  @mandatory @title: '{i18n>Email}';  // format checked in srv/lib/customers.js (keyed, translated message)
  userId : String(255)  @mandatory @title: '{i18n>UserId}';
}

annotate Customers with @title: '{i18n>Customers}'
                        @assert.unique.userId: [ userId ];

annotate Customers with @PersonalData: { EntitySemantics: 'DataSubject' } {
  ID     @PersonalData.FieldSemantics: 'DataSubjectID';
  name   @PersonalData.IsPotentiallyPersonal;
  email  @PersonalData.IsPotentiallyPersonal;
  userId @PersonalData.IsPotentiallyPersonal;
};
