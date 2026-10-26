sap.ui.define(["sap/ui/model/json/JSONModel", "sap/m/library"], function (JSONModel, mobileLibrary) {
    "use strict";

    return {
        onInit: function () {
            const oView = this.getView();
            const oState = new JSONModel({ isBookAdmin: false });
            oView.setModel(oState, "bookAdmin");
            // Unbound function of LandingService: answers only about the caller's own roles.
            oView.getModel("mainModel").bindContext("/isBookAdmin()").requestObject().then(function (oResult) {
                oState.setProperty("/isBookAdmin", oResult.value === true);
            }).catch(function () {
                oState.setProperty("/isBookAdmin", false);
            });
        },
        onAfterRendering: function () {},
        onOpenBookAdmin: function () {
            mobileLibrary.URLHelper.redirect("../../com.bookstore.bookadmin/index.html", false);
        }
    };
});
