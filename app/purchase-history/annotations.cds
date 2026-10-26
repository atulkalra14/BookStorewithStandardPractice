using PurchaseHistoryService as service from '../../srv/purchase-history-service';

annotate service.Orders with @(
    UI.SelectionFields : [
        orderNumber,
        status,
        placedAt,
    ],
    UI.PresentationVariant : {
        $Type     : 'UI.PresentationVariantType',
        SortOrder : [{ $Type : 'Common.SortOrderType', Property : placedAt, Descending : true }],
        Visualizations : ['@UI.LineItem'],
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : orderNumber },
        { $Type : 'UI.DataField', Value : placedAt },
        { $Type : 'UI.DataField', Value : status },
        { $Type : 'UI.DataField', Value : totalAmount },
    ],
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Order}',
        TypeNamePlural : '{i18n>Orders}',
        Title          : { $Type : 'UI.DataField', Value : orderNumber },
        Description    : { $Type : 'UI.DataField', Value : status },
    },
    UI.HeaderFacets : [
        { $Type : 'UI.ReferenceFacet', Target : '@UI.DataPoint#Total', ID : 'TotalFacet' },
        { $Type : 'UI.ReferenceFacet', Target : '@UI.FieldGroup#Dates', ID : 'DatesFacet' },
    ],
    UI.DataPoint #Total : { $Type : 'UI.DataPointType', Value : totalAmount, Title : '{i18n>TotalAmount}' },
    UI.FieldGroup #Dates : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : placedAt },
            { $Type : 'UI.DataField', Value : deliveredAt },
        ],
    },
    UI.FieldGroup #ShipTo : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : shipToName },
            { $Type : 'UI.DataField', Value : shipToStreet },
            { $Type : 'UI.DataField', Value : shipToZip },
            { $Type : 'UI.DataField', Value : shipToCity },
            { $Type : 'UI.DataField', Value : shipToCountry_code },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', Label : '{i18n>OrderItems}', ID : 'ItemsFacet', Target : 'items/@UI.LineItem' },
        { $Type : 'UI.ReferenceFacet', Label : '{i18n>ShipTo}', ID : 'ShipToFacet', Target : '@UI.FieldGroup#ShipTo' },
    ],
);

annotate service.Items with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : bookTitle },
        { $Type : 'UI.DataField', Value : quantity },
        { $Type : 'UI.DataField', Value : unitPrice },
        { $Type : 'UI.DataField', Value : lineTotal },
    ],
);

annotate service.Items with {
    bookTitle @title : '{i18n>Book}';
    unitPrice @Measures.ISOCurrency : order.currency;
    lineTotal @Measures.ISOCurrency : order.currency;
};

annotate service.Orders with {
    totalAmount @Measures.ISOCurrency : currency;
    shipToCountry_code @title : '{i18n>ShipToCountry}';
};
