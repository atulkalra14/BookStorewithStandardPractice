using CatalogService as service from '../../srv/catalog-service';

annotate service.Books with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Book}',
        TypeNamePlural : '{i18n>Books}',
        Title          : { $Type : 'UI.DataField', Value : title },
        Description    : { $Type : 'UI.DataField', Value : author.name },
        ImageUrl       : imageUrl,
    },
    UI.SelectionFields : [
        title,
        author_ID,
    ],
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : imageUrl },
        { $Type : 'UI.DataField', Value : title },
        { $Type : 'UI.DataField', Value : author_ID },
        { $Type : 'UI.DataField', Value : price },
        { $Type : 'UI.DataField', Value : stock },
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : title },
            { $Type : 'UI.DataField', Value : author_ID },
            { $Type : 'UI.DataField', Value : price },
            { $Type : 'UI.DataField', Value : stock },
        ],
    },
    UI.Facets : [
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'GeneralFacet',
            Label  : '{i18n>GeneralInformation}',
            Target : '@UI.FieldGroup#General',
        },
    ],
);

annotate service.Books with {
    imageUrl @(UI.IsImageURL : true, Common.Text : title, Common.TextArrangement : #TextOnly);
    author @(
        Common.Text            : author.name,
        Common.TextArrangement : #TextOnly,
        Common.ValueList       : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'Authors',
            Parameters     : [
                {
                    $Type             : 'Common.ValueListParameterInOut',
                    LocalDataProperty : author_ID,
                    ValueListProperty : 'ID',
                },
                {
                    $Type             : 'Common.ValueListParameterDisplayOnly',
                    ValueListProperty : 'name',
                },
            ],
        },
    );
};
