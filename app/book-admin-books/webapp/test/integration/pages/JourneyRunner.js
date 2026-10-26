sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"com/bookstore/bookadminbooks/test/integration/pages/BooksList.gen",
	"com/bookstore/bookadminbooks/test/integration/pages/BooksObjectPage.gen"
], function (JourneyRunner, BooksListGenerated, BooksObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('com/bookstore/bookadminbooks') + '/test/flp.html#app-preview',
        pages: {
			onTheBooksListGenerated: BooksListGenerated,
			onTheBooksObjectPageGenerated: BooksObjectPageGenerated
        },
        async: true
    });

    return runner;
});

