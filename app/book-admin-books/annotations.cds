using AdminService as service from '../../srv/admin-service';

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
        genre_code,
    ],
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : imageUrl },
        { $Type : 'UI.DataField', Value : title },
        { $Type : 'UI.DataField', Value : author_ID },
        { $Type : 'UI.DataField', Value : genre_code },
        { $Type : 'UI.DataField', Value : price },
        { $Type : 'UI.DataField', Value : stock },
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : title },
            { $Type : 'UI.DataField', Value : author_ID },
            { $Type : 'UI.DataField', Value : genre_code },
            { $Type : 'UI.DataField', Value : descr },
            { $Type : 'UI.DataField', Value : price },
            { $Type : 'UI.DataField', Value : stock },
            { $Type : 'UI.DataField', Value : imageUrl },
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
    // Render the stored path as the cover image in the list and in display mode (same as app/book-shop); edit mode keeps the path input.
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
    genre @(
        Common.Text                     : genre.name,
        Common.TextArrangement          : #TextOnly,
        Common.ValueListWithFixedValues : true,
        Common.ValueList                : {
            $Type          : 'Common.ValueListType',
            CollectionPath : 'Genres',
            Parameters     : [
                {
                    $Type             : 'Common.ValueListParameterInOut',
                    LocalDataProperty : genre_code,
                    ValueListProperty : 'code',
                },
                {
                    $Type             : 'Common.ValueListParameterDisplayOnly',
                    ValueListProperty : 'name',
                },
            ],
        },
    );
};
