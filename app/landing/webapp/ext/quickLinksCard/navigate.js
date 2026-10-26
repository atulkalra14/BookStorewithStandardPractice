sap.ui.define(["sap/m/library"], function (mobileLibrary) {
    "use strict";

    // Opens the app named in the list item's "target" custom data (same tab, like the other card links).
    return {
        open: function (oEvent) {
            mobileLibrary.URLHelper.redirect(oEvent.getSource().data("target"), false);
        }
    };
});
