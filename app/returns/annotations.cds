using ReturnService as service from '../../srv/return-service';

annotate service.Returns with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Return}',
        TypeNamePlural : '{i18n>Returns}',
        Title          : { $Type : 'UI.DataField', Value : returnNumber },
    },
    UI.SelectionFields : [
        returnNumber,
        status,
        requestedAt,
    ],
    UI.PresentationVariant : {
        $Type          : 'UI.PresentationVariantType',
        SortOrder      : [{ $Type : 'Common.SortOrderType', Property : requestedAt, Descending : true }],
        Visualizations : ['@UI.LineItem'],
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : returnNumber },
        { $Type : 'UI.DataField', Value : orderNumber, Label : '{i18n>Order}' },
        { $Type : 'UI.DataField', Value : requestedAt },
        { $Type : 'UI.DataField', Value : status },
        { $Type : 'UI.DataField', Value : refundAmount },
        { $Type : 'UI.DataFieldForAction', Action : 'ReturnService.cancel', Label : '{i18n>CancelReturn}', InvocationGrouping : #Isolated },
    ],
    UI.HeaderFacets : [
        { $Type : 'UI.ReferenceFacet', ID : 'RefundFacet', Target : '@UI.DataPoint#Refund' },
        { $Type : 'UI.ReferenceFacet', ID : 'StatusFacet', Target : '@UI.DataPoint#Status' },
    ],
    UI.DataPoint #Refund : {
        $Type : 'UI.DataPointType',
        Title : '{i18n>RefundAmount}',
        Value : refundAmount,
    },
    UI.DataPoint #Status : {
        $Type : 'UI.DataPointType',
        Title : '{i18n>ReturnStatus}',
        Value : status,
    },
    UI.FieldGroup #Details : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : order_ID },
            { $Type : 'UI.DataField', Value : comment },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', ID : 'DetailsFacet', Label : '{i18n>ReturnDetails}', Target : '@UI.FieldGroup#Details' },
        { $Type : 'UI.ReferenceFacet', ID : 'ItemsFacet', Label : '{i18n>ReturnedBooks}', Target : 'items/@UI.LineItem' },
    ],
);

annotate service.Returns with {
    refundAmount @Measures.ISOCurrency : currency;

    // Only delivered, not cancelled orders of the caller are offered. The return window is checked on submission.
    order @(
        Common.Text            : order.orderNumber,
        Common.TextArrangement : #TextOnly,
        Common.ValueList       : {
            $Type           : 'Common.ValueListType',
            CollectionPath  : 'Orders',
            SearchSupported : true,
            Parameters      : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : order_ID, ValueListProperty : 'ID' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'orderNumber' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'placedAt' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'deliveredAt' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'totalAmount' },
            ],
        },
    );
};

annotate service.ReturnItems with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : orderItem_ID },
        { $Type : 'UI.DataField', Value : quantity },
        { $Type : 'UI.DataField', Value : reason_code },
        { $Type : 'UI.DataField', Value : unitPrice },
        { $Type : 'UI.DataField', Value : lineRefund },
    ],
);

annotate service.ReturnItems with {
    // Items of the chosen order only (the "In" parameter filters by the order of the parent return).
    orderItem @(
        Common.Text            : orderItem.bookTitle,
        Common.TextArrangement : #TextOnly,
        Common.ValueList       : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'OrderItems',
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : orderItem_ID, ValueListProperty : 'ID' },
                { $Type : 'Common.ValueListParameterIn', LocalDataProperty : return.order_ID, ValueListProperty : 'order_ID' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'bookTitle' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'quantity' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'unitPrice' },
            ],
        },
    );

    reason @(
        Common.Text                     : reason.name,
        Common.TextArrangement          : #TextOnly,
        Common.ValueListWithFixedValues : true,
        Common.ValueList                : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'ReturnReasons',
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : reason_code, ValueListProperty : 'code' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' },
            ],
        },
    );
};

// Changing an item changes the refund amount: ask the UI to reload it.
annotate service.ReturnItems with @(
    Common.SideEffects : {
        $Type            : 'Common.SideEffectsType',
        SourceProperties : [ orderItem_ID, quantity ],
        TargetEntities   : [ return ],
    },
);

// Adding or deleting an item also changes the refund amount.
annotate service.Returns with @(
    Common.SideEffects #Items : {
        $Type            : 'Common.SideEffectsType',
        SourceEntities   : [ items ],
        TargetProperties : [ 'refundAmount' ],
    },
);
