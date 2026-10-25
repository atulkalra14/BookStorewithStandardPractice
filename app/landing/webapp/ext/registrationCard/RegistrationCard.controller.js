sap.ui.define([
    "sap/ui/core/Fragment",
    "sap/ui/model/resource/ResourceModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Fragment, ResourceModel, MessageToast, MessageBox) {
    "use strict";

    // The server validates again; this only gives quick feedback. Same pattern as srv/lib/customers.js.
    const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    // Returns the text for a key in the request language (works for a synchronous and an asynchronous model).
    async function text(oCard, sKey) {
        const oBundle = await oCard.getView().getModel("regI18n").getResourceBundle();
        return oBundle.getText(sKey);
    }

    function input(oCard, sId) {
        return Fragment.byId(oCard.getView().getId(), sId);
    }

    // The user is identified by the login token on the server: the form sends no user ID.
    function registrationModel(oCard) {
        return oCard.getView().getModel("registrationModel") || oCard.getOwnerComponent().getModel("registrationModel");
    }

    return {
        onInit: function () {
            // A custom card does not get the app's text model, so it loads the app text bundle itself.
            // English is the default file (i18n.properties, no i18n_en.properties), so its locale is "" here.
            // The build does this rewrite only for models declared in the manifest.
            const oI18n = new ResourceModel({
                bundleName: "com.bookstore.landing.i18n.i18n",
                supportedLocales: ["", "de"]
            });
            this.getView().setModel(oI18n, "regI18n");
        },

        onOpenRegistration: async function () {
            if (!this._oRegisterDialog) {
                this._oRegisterDialog = await Fragment.load({
                    id: this.getView().getId(),
                    name: "com.bookstore.landing.ext.registrationCard.RegistrationDialog",
                    controller: this
                });
                this.getView().addDependent(this._oRegisterDialog);
            }
            input(this, "registerName").setValue("").setValueState("None");
            input(this, "registerEmail").setValue("").setValueState("None");
            this._oRegisterDialog.open();
        },

        onCancelRegistration: function () {
            this._oRegisterDialog.close();
        },

        onSubmitRegistration: async function () {
            const oName = input(this, "registerName");
            const oEmail = input(this, "registerEmail");
            const sName = oName.getValue().trim();
            const sEmail = oEmail.getValue().trim();
            const bEmailValid = EMAIL_PATTERN.test(sEmail);

            oName.setValueState(sName ? "None" : "Error").setValueStateText(await text(this, "registerNameRequired"));
            oEmail.setValueState(bEmailValid ? "None" : "Error").setValueStateText(await text(this, "registerEmailInvalid"));
            if (!sName || !bEmailValid) {
                return;
            }

            const oAction = registrationModel(this).bindContext("/registerCustomer(...)");
            oAction.setParameter("name", sName);
            oAction.setParameter("email", sEmail);

            this._oRegisterDialog.setBusy(true);
            try {
                await oAction.execute();
                this._oRegisterDialog.close();
                MessageToast.show(await text(this, "registerSuccess"));
            } catch (oError) {
                // The message comes from the server in the request language (for example "already registered").
                MessageBox.error((oError.error && oError.error.message) || await text(this, "registerErrorGeneric"));
            } finally {
                this._oRegisterDialog.setBusy(false);
            }
        }
    };
});
