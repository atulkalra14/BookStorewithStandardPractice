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
);

annotate service.Orders with {
    totalAmount @Measures.ISOCurrency : currency;
};
