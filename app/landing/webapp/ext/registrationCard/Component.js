sap.ui.define(["sap/ovp/cards/custom/Component"], function (CustomCardComponent) {
    "use strict";

    return CustomCardComponent.extend("com.bookstore.landing.ext.registrationCard.Component", {
        metadata: {
            properties: {
                contentFragment: {
                    type: "string",
                    defaultValue: "com.bookstore.landing.ext.registrationCard.RegistrationCard"
                }
            },
            customizing: {
                "sap.ui.controllerExtensions": {
                    "sap.ovp.cards.generic.Card": {
                        controllerName: "com.bookstore.landing.ext.registrationCard.RegistrationCard"
                    }
                }
            },
            version: "${version}",
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
