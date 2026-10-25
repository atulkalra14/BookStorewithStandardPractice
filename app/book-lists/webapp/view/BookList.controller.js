sap.ui.define(["sap/ui/core/mvc/Controller", "sap/m/library"], function (Controller, mobileLibrary) {
    "use strict";

    // Back goes to the landing page; these pages are only reachable from its cards.
    return Controller.extend("com.bookstore.booklists.view.BookList", {
        onNavBack: function () {
            mobileLibrary.URLHelper.redirect("../com.bookstore.landing/index.html", false);
        }
    });
});
