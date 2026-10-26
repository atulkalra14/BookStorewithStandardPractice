using OrderService as service from '../../srv/order-service';

annotate service.Orders with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Order}',
        TypeNamePlural : '{i18n>Orders}',
        Title          : { $Type : 'UI.DataField', Value : orderNumber },
    },
    UI.SelectionFields : [
        orderNumber,
        status,
        placedAt,
    ],
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : orderNumber },
        { $Type : 'UI.DataField', Value : placedAt },
        { $Type : 'UI.DataField', Value : status },
        { $Type : 'UI.DataField', Value : totalAmount },
        { $Type : 'UI.DataFieldForAction', Action : 'OrderService.cancel', Label : '{i18n>CancelOrder}', InvocationGrouping : #Isolated },
    ],
    UI.HeaderFacets : [
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'TotalFacet',
            Target : '@UI.DataPoint#Total',
        },
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'StatusFacet',
            Target : '@UI.DataPoint#Status',
        },
    ],
    UI.DataPoint #Total : {
        $Type : 'UI.DataPointType',
        Title : '{i18n>TotalAmount}',
        Value : totalAmount,
    },
    UI.DataPoint #Status : {
        $Type : 'UI.DataPointType',
        Title : '{i18n>OrderStatus}',
        Value : status,
    },
    UI.FieldGroup #Shipping : {
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
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'ItemsFacet',
            Label  : '{i18n>CartItems}',
            Target : 'items/@UI.LineItem',
        },
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'ShippingFacet',
            Label  : '{i18n>ShippingAddress}',
            Target : '@UI.FieldGroup#Shipping',
        },
    ],
);

annotate service.Orders with {
    totalAmount @Measures.ISOCurrency : currency;

    // Country picker: CAP common code list (names are localized).
    shipToCountry @(
        Common.Text            : shipToCountry.name,
        Common.TextArrangement : #TextFirst,
        Common.ValueListWithFixedValues : false,
        Common.ValueList       : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'Countries',
            SearchSupported : true,
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : shipToCountry_code, ValueListProperty : 'code' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' },
            ],
        },
    );

    // Saved addresses: picking one fills the whole ship-to. Typing a new address is still possible (not fixed values).
    shipToName @(
        Common.ValueListWithFixedValues : false,
        Common.ValueList #SavedAddresses : {
            $Type          : 'Common.ValueListType',
            Label          : '{i18n>SavedAddresses}',
            CollectionPath : 'CustomerAddresses',
            SearchSupported : true,
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : shipToName, ValueListProperty : 'name' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : shipToStreet, ValueListProperty : 'street' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : shipToZip, ValueListProperty : 'zip' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : shipToCity, ValueListProperty : 'city' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : shipToCountry_code, ValueListProperty : 'country_code' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'label' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'isDefault' },
            ],
        },
    );

    // Postal code search help (Essen only). Picking a code also fills the city.
    shipToZip @(
        Common.ValueList : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'PostalCodes',
            SearchSupported : true,
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : shipToZip, ValueListProperty : 'code' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : shipToCity, ValueListProperty : 'city' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'districts' },
            ],
        },
    );
};

annotate service.OrderItems with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : book_ID },
        { $Type : 'UI.DataField', Value : quantity },
        { $Type : 'UI.DataField', Value : unitPrice },
        { $Type : 'UI.DataField', Value : lineTotal },
    ],
);

annotate service.OrderItems with {
    book @(
        Common.Text            : book.title,
        Common.TextArrangement : #TextOnly,
        Common.ValueList       : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'Books',
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : book_ID, ValueListProperty : 'ID' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'title' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'authorName' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'price' },
            ],
        },
    );
};

// Changing an item changes the cart total: ask the UI to reload it.
annotate service.OrderItems with @(
    Common.SideEffects : {
        $Type            : 'Common.SideEffectsType',
        SourceProperties : [ book_ID, quantity ],
        TargetEntities   : [ order ],
    },
);

// Adding or deleting an item also changes the cart total.
annotate service.Orders with @(
    Common.SideEffects #Items : {
        $Type            : 'Common.SideEffectsType',
        SourceEntities   : [ items ],
        TargetProperties : [ 'totalAmount' ],
    },
);

// "My Addresses": list and edit the saved ship-to addresses (second route of this app, see manifest.json).
annotate service.CustomerAddresses with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>CustomerAddress}',
        TypeNamePlural : '{i18n>CustomerAddresses}',
        Title          : { $Type : 'UI.DataField', Value : name },
        Description    : { $Type : 'UI.DataField', Value : street },
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : label },
        { $Type : 'UI.DataField', Value : name },
        { $Type : 'UI.DataField', Value : street },
        { $Type : 'UI.DataField', Value : zip },
        { $Type : 'UI.DataField', Value : city },
        { $Type : 'UI.DataField', Value : isDefault },
        { $Type : 'UI.DataField', Value : lastUsedAt },
    ],
    UI.FieldGroup #Address : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : label },
            { $Type : 'UI.DataField', Value : name },
            { $Type : 'UI.DataField', Value : street },
            { $Type : 'UI.DataField', Value : zip },
            { $Type : 'UI.DataField', Value : city },
            { $Type : 'UI.DataField', Value : country_code },
            { $Type : 'UI.DataField', Value : isDefault },
        ],
    },
    UI.Facets : [
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'AddressFacet',
            Label  : '{i18n>ShippingAddress}',
            Target : '@UI.FieldGroup#Address',
        },
    ],
);

annotate service.CustomerAddresses with {
    // The owner is set by the handler and never shown.
    customer @UI.Hidden;

    country @(
        Common.Text            : country.name,
        Common.TextArrangement : #TextFirst,
        Common.ValueListWithFixedValues : false,
        Common.ValueList       : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'Countries',
            SearchSupported : true,
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : country_code, ValueListProperty : 'code' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' },
            ],
        },
    );

    zip @(
        Common.ValueList : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'PostalCodes',
            SearchSupported : true,
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : zip, ValueListProperty : 'code' },
                { $Type : 'Common.ValueListParameterOut', LocalDataProperty : city, ValueListProperty : 'city' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'districts' },
            ],
        },
    );
};

// Placed and cancelled orders are immutable (srv/lib/orders.js): grey out Delete for them. isEditable is true only for a cart
// (a draft row, status null); the server rejects edit and delete of active rows regardless. UpdateRestrictions only
// takes effect on sub-object pages: the Edit button of this page is controlled by draftEdit (see srv/order-service.cds).
annotate service.Orders with @(
    Capabilities.UpdateRestrictions : { Updatable : isEditable },
    Capabilities.DeleteRestrictions : { Deletable : isEditable },
);
