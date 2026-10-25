sap.ui.define(["sap/m/library"], function (mobileLibrary) {
    "use strict";

    // Opens the demo website page with the top 10 books (same tab, like the other card links).
    return {
        open: function () {
            mobileLibrary.URLHelper.redirect("website/top-books.html", false);
        }
    };
});
