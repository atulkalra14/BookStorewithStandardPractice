sap.ui.define(["sap/ovp/cards/custom/Component"], function (CustomCardComponent) {
    "use strict";

    return CustomCardComponent.extend("com.bookstore.landing.ext.bookAdminCard.Component", {
        metadata: {
            properties: {
                contentFragment: {
                    type: "string",
                    defaultValue: "com.bookstore.landing.ext.bookAdminCard.BookAdminCard"
                },
                customizing: {
                    "sap.ui.controllerExtensions": {
                        "sap.ovp.cards.generic.Card": {
                            controllerName: "com.bookstore.landing.ext.bookAdminCard.BookAdminCard"
                        }
                    }
                }
            },
            version: "1.0.0",
            library: "sap.ovp",
            includes: [],
            dependencies: {
                libs: [],
                components: []
            },
            config: {}
        }
    });
});
