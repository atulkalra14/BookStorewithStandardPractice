using LandingService as service from '../../srv/landing-service';

annotate service.NewArrivals with { imageUrl @UI.IsImageURL : true };
annotate service.BestSellers with { imageUrl @UI.IsImageURL : true };
annotate service.StoreInfo   with { heroImageUrl @UI.IsImageURL : true };


annotate service.ActiveDiscounts with @UI.LineItem #Discounts : [
    { $Type : 'UI.DataField', Value : bookTitle, Label : '{i18n>Book}' },
    { $Type : 'UI.DataField', Value : percent },
    { $Type : 'UI.DataField', Value : validTo },
];

annotate service.BestSellers with @UI.LineItem #BestSellers : [
    { $Type : 'UI.DataField', Value : title, Label : '{i18n>Title}' },
    { $Type : 'UI.DataField', Value : sold, Label : '{i18n>Sold}' },
];
