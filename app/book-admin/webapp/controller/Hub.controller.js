sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/library"
], (Controller, mobileLibrary) => {
    "use strict";

    return Controller.extend("com.bookstore.bookadmin.controller.Hub", {
        onInit() {
        },

        // The app itself enforces the BookAdmin role on the server (AdminService); this only navigates.
        onOpenBooks() {
            mobileLibrary.URLHelper.redirect("../../com.bookstore.bookadminbooks/index.html", false);
        }
    });
});
