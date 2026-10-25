namespace bookstore;

// Delivery is limited to Essen (North Rhine-Westphalia) for now: this code list feeds the postal code search help.
entity PostalCodes {
  key code      : String(5)   @title: '{i18n>PostalCode}';
      city      : String(60)  @title: '{i18n>City}';       // always 'Essen' for now
      districts : String(255) @title: '{i18n>Districts}';  // Stadtteile, comma-separated (search help text only)
}

annotate PostalCodes with @title: '{i18n>PostalCodes}' @cds.autoexpose;
