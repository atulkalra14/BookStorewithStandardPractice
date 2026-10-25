using LandingService as service from '../../srv/landing-service';

annotate service.NewArrivals with @UI.LineItem #NewArrivals : [
    { $Type : 'UI.DataField', Value : title },
    { $Type : 'UI.DataField', Value : price },
];

annotate service.ActiveDiscounts with @UI.LineItem #Discounts : [
    { $Type : 'UI.DataField', Value : bookTitle, Label : '{i18n>Book}' },
    { $Type : 'UI.DataField', Value : percent },
    { $Type : 'UI.DataField', Value : validTo },
];

annotate service.StoreInfo with @UI.LineItem #StoreInfo : [
    { $Type : 'UI.DataField', Value : name },
    { $Type : 'UI.DataField', Value : address },
    { $Type : 'UI.DataField', Value : openingHours },
    { $Type : 'UI.DataField', Value : phone },
];

annotate service.BestSellers with @UI.LineItem #BestSellers : [
    { $Type : 'UI.DataField', Value : title, Label : '{i18n>Title}' },
    { $Type : 'UI.DataField', Value : sold, Label : '{i18n>Sold}' },
];
