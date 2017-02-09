'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function getDefaults() {
  return {
    loadPath: '/locales/{{lng}}/{{ns}}.json'
  };
}

var resBundle = require(
  "i18next-resource-store-loader!./assets/i18n/index.js"
);

var qordobaResBundle = require(
  "i18next-resource-store-loader!./assets/qordoba/index.js"
);


var Plugin = function () {
  function Plugin(services) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Plugin);

    this.init(services, options);
    console.log('services from middleware', services)
    this.type = 'backend';
  }

  _createClass(Plugin, [{
    key: 'init',
    value: function init(services, backendOptions, i18nextOptions) { /* use services and options */}
  }, {
    key: 'read',
    value: function read(language, namespace, callback) {
      // grab current resource from bundle, based on language and namespace
      const resource = resBundle[language][namespace];
      // add resource to resStore
      callback(null, resource);
    }
  }, {
    key: 'loadUrl',
    value: function loadUrl(url, callback) {
    }
  }, {
    key: 'create',
    value: function create(languages, namespace, key, fallbackValue) {

    }
  }]);

  return Plugin;
}();

Plugin.type = 'backend';

module.exports = Plugin;