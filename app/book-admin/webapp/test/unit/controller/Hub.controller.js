/*global QUnit*/

sap.ui.define([
	"com/bookstore/bookadmin/controller/Hub.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Hub Controller");

	QUnit.test("I should test the Hub controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
