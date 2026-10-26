using AdminService as service from '../../srv/admin-service';

annotate service.Returns with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Return}',
        TypeNamePlural : '{i18n>Returns}',
        Title          : { $Type : 'UI.DataField', Value : returnNumber },
        Description    : { $Type : 'UI.DataField', Value : status },
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
    // reject and cancel exist on both AdminService.Orders and AdminService.Returns (overloads in OData): the action names
    // carry the binding parameter type so that this app calls its own. Not checked in a browser yet.
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : returnNumber },
        { $Type : 'UI.DataField', Value : orderNumber, Label : '{i18n>Order}' },
        { $Type : 'UI.DataField', Value : customer.name },
        { $Type : 'UI.DataField', Value : requestedAt },
        { $Type : 'UI.DataField', Value : status },
        { $Type : 'UI.DataField', Value : refundAmount },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.approve', Label : '{i18n>ApproveReturn}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.reject(AdminService.Returns)', Label : '{i18n>RejectReturn}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.cancel(AdminService.Returns)', Label : '{i18n>CancelReturn}' },
    ],
    // Header buttons of the object page: the same three decisions.
    UI.Identification : [
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.approve', Label : '{i18n>ApproveReturn}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.reject(AdminService.Returns)', Label : '{i18n>RejectReturn}' },
        { $Type : 'UI.DataFieldForAction', Action : 'AdminService.cancel(AdminService.Returns)', Label : '{i18n>CancelReturn}' },
    ],
    UI.HeaderFacets : [
        { $Type : 'UI.ReferenceFacet', ID : 'RefundFacet', Target : '@UI.DataPoint#Refund' },
        { $Type : 'UI.ReferenceFacet', ID : 'DatesFacet', Target : '@UI.FieldGroup#Dates' },
    ],
    UI.DataPoint #Refund : {
        $Type : 'UI.DataPointType',
        Title : '{i18n>RefundAmount}',
        Value : refundAmount,
    },
    UI.FieldGroup #Dates : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : requestedAt },
        ],
    },
    UI.FieldGroup #Details : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : orderNumber, Label : '{i18n>Order}' },
            { $Type : 'UI.DataField', Value : comment },
        ],
    },
    UI.FieldGroup #Customer : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : customer.name },
            { $Type : 'UI.DataField', Value : customer.email },
        ],
    },
    // What the customer sees in the Returns app: set by the approve, reject and cancel actions.
    UI.FieldGroup #ShopDecision : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : decisionReason },
            { $Type : 'UI.DataField', Value : decidedAt },
        ],
    },
    UI.Facets : [
        { $Type : 'UI.ReferenceFacet', ID : 'DetailsFacet', Label : '{i18n>ReturnDetails}', Target : '@UI.FieldGroup#Details' },
        { $Type : 'UI.ReferenceFacet', ID : 'ItemsFacet', Label : '{i18n>ReturnedBooks}', Target : 'items/@UI.LineItem' },
        { $Type : 'UI.ReferenceFacet', ID : 'CustomerFacet', Label : '{i18n>Customer}', Target : '@UI.FieldGroup#Customer' },
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'ShopDecisionFacet',
            Label  : '{i18n>ShopDecision}',
            Target : '@UI.FieldGroup#ShopDecision',
            ![@UI.Hidden] : (decidedAt is null),
        },
    ],
);

annotate service.Returns with {
    refundAmount   @Measures.ISOCurrency : currency;
    decisionReason @UI.MultiLineText;
};

annotate service.ReturnItems with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : bookTitle },
        { $Type : 'UI.DataField', Value : quantity },
        { $Type : 'UI.DataField', Value : reason_code },
        { $Type : 'UI.DataField', Value : unitPrice },
        { $Type : 'UI.DataField', Value : lineRefund },
    ],
);

annotate service.ReturnItems with {
    bookTitle  @title : '{i18n>Book}';
    unitPrice  @Measures.ISOCurrency : return.currency;
    lineRefund @Measures.ISOCurrency : return.currency;
    // Shows the reason name in the request language instead of the code.
    reason     @(
        Common.Text            : reason.name,
        Common.TextArrangement : #TextOnly,
    );
};
