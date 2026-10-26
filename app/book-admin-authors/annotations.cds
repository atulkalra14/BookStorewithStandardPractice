using AdminService as service from '../../srv/admin-service';

annotate service.Authors with @(
    UI.HeaderInfo : {
        $Type          : 'UI.HeaderInfoType',
        TypeName       : '{i18n>Author}',
        TypeNamePlural : '{i18n>Authors}',
        Title          : { $Type : 'UI.DataField', Value : name },
    },
    UI.SelectionFields : [
        name,
    ],
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : name },
        { $Type : 'UI.DataField', Value : dateOfBirth },
    ],
    UI.FieldGroup #General : {
        $Type : 'UI.FieldGroupType',
        Data  : [
            { $Type : 'UI.DataField', Value : name },
            { $Type : 'UI.DataField', Value : dateOfBirth },
        ],
    },
    UI.Facets : [
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'GeneralFacet',
            Label  : '{i18n>GeneralInformation}',
            Target : '@UI.FieldGroup#General',
        },
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'BooksFacet',
            Label  : '{i18n>Books}',
            Target : 'books/@UI.LineItem#AuthorBooks',
        },
    ],
);

// Books of one author, shown read-only on the author page (Books are maintained in the Books app).
annotate service.Books with @(
    UI.LineItem #AuthorBooks : [
        { $Type : 'UI.DataField', Value : title },
        { $Type : 'UI.DataField', Value : genre_code },
        { $Type : 'UI.DataField', Value : price },
        { $Type : 'UI.DataField', Value : stock },
    ],
);
