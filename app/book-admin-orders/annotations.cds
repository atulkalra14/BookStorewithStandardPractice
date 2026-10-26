using AdminService as service from '../../srv/admin-service';

annotate service.Orders with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Order}',
        TypeNamePlural : '{i18n>Orders}',
        Title          : { $Type : 'UI.DataField', Value : orderNumber },
        Description    : { $Type : 'UI.DataField', Value : status },
    },
    UI.SelectionFields : [
        orderNumber,
        status,
        placedAt,
    ],
    UI.PresentationVariant : {
        $Type          : 'UI.PresentationVariantType',
        SortOrder      : [{ $Type : 'Common.SortOrderType', Property : placedAt, Descending : true }],
        Visualizations : ['@UI.LineItem'],
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : orderNumber },
        { $Type : 'UI.DataField', Value : customer.name },
        { $Type : 'UI.DataField', Value : placedAt },
        { $Type : 'UI.DataField', Value : status },
        { $Type : 'UI.DataField', Value : totalAmount },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.accept', Label : '{i18n>AcceptOrder}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.reject', Label : '{i18n>RejectOrder}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.cancel', Label : '{i18n>CancelOrder}' },
    ],
    // Header buttons of the object page: the same three decisions.
    UI.Identification : [
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.accept', Label : '{i18n>AcceptOrder}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.reject', Label : '{i18n>RejectOrder}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.cancel', Label : '{i18n>CancelOrder}' },
    ],
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
    UI.FieldGroup #Customer : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : customer.name },
            { $Type : 'UI.DataField', Value : customer.email },
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
    // What the customer sees in the Purchase History: set by the accept, reject and cancel actions.
    UI.FieldGroup #ShopDecision : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : decisionReason },
            { $Type : 'UI.DataField', Value : decidedAt },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', Label : '{i18n>OrderItems}', ID : 'ItemsFacet', Target : 'items/@UI.LineItem' },
        { $Type : 'UI.ReferenceFacet', Label : '{i18n>Customer}', ID : 'CustomerFacet', Target : '@UI.FieldGroup#Customer' },
        { $Type : 'UI.ReferenceFacet', Label : '{i18n>ShipTo}', ID : 'ShipToFacet', Target : '@UI.FieldGroup#ShipTo' },
        {
            $Type  : 'UI.ReferenceFacet',
            Label  : '{i18n>ShopDecision}',
            ID     : 'ShopDecisionFacet',
            Target : '@UI.FieldGroup#ShopDecision',
            ![@UI.Hidden] : (decidedAt is null),
        },
    ],
);

annotate service.Orders with {
    totalAmount        @Measures.ISOCurrency : currency;
    decisionReason     @UI.MultiLineText;
};

annotate service.OrderItems with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : bookTitle },
        { $Type : 'UI.DataField', Value : quantity },
        { $Type : 'UI.DataField', Value : unitPrice },
        { $Type : 'UI.DataField', Value : lineTotal },
    ],
);

annotate service.OrderItems with {
    bookTitle @title : '{i18n>Book}';
    unitPrice @Measures.ISOCurrency : order.currency;
    lineTotal @Measures.ISOCurrency : order.currency;
};
