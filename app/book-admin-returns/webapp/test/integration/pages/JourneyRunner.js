sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/bookstore/bookadminreturns/test/integration/pages/ReturnsList.gen",
	"com/bookstore/bookadminreturns/test/integration/pages/ReturnsObjectPage.gen"
], function (JourneyRunner, ReturnsListGenerated, ReturnsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/bookstore/bookadminreturns') + '/test/flp.html#app-preview',
        pages: {
			onTheReturnsListGenerated: ReturnsListGenerated,
			onTheReturnsObjectPageGenerated: ReturnsObjectPageGenerated
        },
        async: true
    });

    return runner;
});
