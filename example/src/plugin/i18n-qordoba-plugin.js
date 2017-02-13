'use strict';

// define as es module
Object.defineProperty(exports, "__esModule", {
  value: true
});

// import dependencies

// build resource bundle
// var resBundle = require("i18next-resource-store-loader!../assets/i18n/index.js");
// var qordobaResBundle = require("i18next-resource-store-loader!../assets/qordoba/index.js");

// var getLanguages = require('./utils')('../assets/i18n/')
// import 

class Plugin {
	init(services, backendOptions, i18nextOptions) {
		// use services and options
		// console.log(this);
		// addResourceBundle('en', 'jumbo', qordobaResBundle.en.jumbo, true, true);
	}

	read(language, namespace, callback) {
		console.log('calling resource for:', language, namespace)
		// grab current resource from bundle, based on language and namespace
		const resource = qordobaResBundle[language][namespace];
		console.log('adding resource:', resource)
		// add resource to resStore
		callback(null, resource);
	}
}

Plugin.type = 'backend';

module.exports = Plugin;