sap.ui.define(["sap/ui/core/mvc/Controller", "sap/m/library"], function (Controller, mobileLibrary) {
    "use strict";

    // Browser tab title per page: the same text as the card title on the landing page.
    const TITLE_KEYS = {
        "com.bookstore.booklists.view.BestSellers": "bestSellersTitle",
        "com.bookstore.booklists.view.Discounts": "discountsTitle",
        "com.bookstore.booklists.view.NewArrivals": "newArrivalsTitle"
    };

    // Back goes to the landing page; these pages are only reachable from its cards.
    return Controller.extend("com.bookstore.booklists.view.BookList", {
        onInit: function () {
            const key = TITLE_KEYS[this.getView().getViewName()];
            const model = this.getOwnerComponent().getModel("i18n");
            if (!key || !model) {
                return;
            }
            const bundle = model.getResourceBundle();
            const setTitle = function (b) {
                document.title = b.getText(key);
            };
            // The bundle is a promise when the model loads it asynchronously.
            if (bundle && typeof bundle.then === "function") {
                bundle.then(setTitle);
            } else {
                setTitle(bundle);
            }
        },

        onNavBack: function () {
            mobileLibrary.URLHelper.redirect("../com.bookstore.landing/index.html", false);
        }
    });
});
