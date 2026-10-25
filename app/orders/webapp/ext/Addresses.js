sap.ui.define(["sap/ui/core/routing/HashChanger"], function (HashChanger) {
	"use strict";

	return {
		// Toolbar action "My Addresses": opens the second list report of this app (route CustomerAddressesList).
		open: function () {
			HashChanger.getInstance().setHash("CustomerAddresses");
		}
	};
});
