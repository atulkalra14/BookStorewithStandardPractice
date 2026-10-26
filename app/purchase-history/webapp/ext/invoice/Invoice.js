sap.ui.define([
	"sap/base/i18n/Localization",
	"sap/base/i18n/ResourceBundle",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (Localization, ResourceBundle, MessageBox, MessageToast) {
	"use strict";

	const SERVICE = "/odata/v4/purchase-history/";

	// Calls the bound function Orders(<ID>)/PurchaseHistoryService.invoice() and saves the returned PDF.
	async function download(orderID, bundle) {
		const response = await fetch(`${SERVICE}Orders(${encodeURIComponent(orderID)})/PurchaseHistoryService.invoice()`, {
			headers: { "Accept-Language": Localization.getLanguageTag().toString() }
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body?.error?.message || bundle.getText("InvoiceDownloadFailed"));
		}
		const match = /filename="?([^";]+)"?/.exec(response.headers.get("Content-Disposition") || "");
		const link = document.createElement("a");
		link.href = URL.createObjectURL(await response.blob());
		link.download = match ? match[1] : "invoice.pdf";
		link.click();
		URL.revokeObjectURL(link.href);
	}

	async function run(context) {
		const bundle = await ResourceBundle.create({
			url: sap.ui.require.toUrl("com/bookstore/purchasehistory/i18n/i18n.properties"),
			supportedLocales: ["en", "de"],
			fallbackLocale: "en"
		});
		try {
			await download(context.getProperty("ID"), bundle);
			MessageToast.show(bundle.getText("InvoiceDownloaded"));
		} catch (error) {
			MessageBox.error(error.message);
		}
	}

	return {
		// List report: custom table action, handler gets the page context and the selected rows.
		downloadSelected: function (pageContext, selectedContexts) {
			return run(selectedContexts[0]);
		},
		// Object page header: handler gets the context of the displayed order.
		downloadCurrent: function (context) {
			return run(context);
		}
	};
});
