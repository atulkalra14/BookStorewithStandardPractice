sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/bookstore/orders/test/integration/pages/OrdersList.gen",
	"com/bookstore/orders/test/integration/pages/OrdersObjectPage.gen",
	"com/bookstore/orders/test/integration/pages/OrderItemsObjectPage.gen"
], function (JourneyRunner, OrdersListGenerated, OrdersObjectPageGenerated, OrderItemsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/bookstore/orders') + '/test/flp.html#app-preview',
        pages: {
			onTheOrdersListGenerated: OrdersListGenerated,
			onTheOrdersObjectPageGenerated: OrdersObjectPageGenerated,
			onTheOrderItemsObjectPageGenerated: OrderItemsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

