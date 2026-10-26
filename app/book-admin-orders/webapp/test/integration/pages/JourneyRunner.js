sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/bookstore/bookadminorders/test/integration/pages/OrdersList.gen",
	"com/bookstore/bookadminorders/test/integration/pages/OrdersObjectPage.gen"
], function (JourneyRunner, OrdersListGenerated, OrdersObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/bookstore/bookadminorders') + '/test/flp.html#app-preview',
        pages: {
			onTheOrdersListGenerated: OrdersListGenerated,
			onTheOrdersObjectPageGenerated: OrdersObjectPageGenerated
        },
        async: true
    });

    return runner;
});
