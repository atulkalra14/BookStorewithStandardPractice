sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/bookstore/returns/test/integration/pages/ReturnsList.gen",
	"com/bookstore/returns/test/integration/pages/ReturnsObjectPage.gen"
], function (JourneyRunner, ReturnsListGenerated, ReturnsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/bookstore/returns') + '/test/flp.html#app-preview',
        pages: {
			onTheReturnsListGenerated: ReturnsListGenerated,
			onTheReturnsObjectPageGenerated: ReturnsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

