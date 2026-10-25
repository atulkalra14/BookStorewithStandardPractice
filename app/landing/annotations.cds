using LandingService as service from '../../srv/landing-service';

annotate service.NewArrivals with @(
    UI.LineItem #NewArrivals : [
        { $Type : 'UI.DataField', Value : title },
        { $Type : 'UI.DataField', Value : price },
    ],
    // Dynamic link list card: cover as list image, title and price as text.
    UI.HeaderInfo #NewArrivals : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Book}',
        TypeNamePlural : '{i18n>Books}',
        Title          : { $Type : 'UI.DataField', Value : title },
        Description    : { $Type : 'UI.DataField', Value : price },
        ImageUrl       : imageUrl,
    },
);

annotate service.NewArrivals with { imageUrl @UI.IsImageURL : true };
annotate service.BestSellers with { imageUrl @UI.IsImageURL : true };
annotate service.StoreInfo   with { heroImageUrl @UI.IsImageURL : true };


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
