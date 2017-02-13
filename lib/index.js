'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _utils = require('./utils');

var utils = _interopRequireWildcard(_utils);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _json = require('json5');

var _json2 = _interopRequireDefault(_json);

var _jsYaml = require('js-yaml');

var _jsYaml2 = _interopRequireDefault(_jsYaml);

var _Qordoba = require('./Qordoba');

var qordoba = _interopRequireWildcard(_Qordoba);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getDefaults() {
  return {
    loadPath: '/locales/qordoba/{{lng}}/{{ns}}.json',
    addPath: '/locales/qordoba/{{lng}}/{{ns}}.missing.json',
    jsonIndent: 2
  };
}

function readFile(filename, callback) {
  _fs2.default.readFile(filename, 'utf8', function (err, data) {
    if (err) {
      callback(err);
    } else {
      var result = void 0;
      try {
        data = data.replace(/^\uFEFF/, '');
        switch (_path2.default.extname(filename)) {
          case '.json5':
            result = _json2.default.parse(data);
            break;
          case '.yml':
          case '.yaml':
            result = _jsYaml2.default.safeLoad(data);
            break;
          default:
            result = JSON.parse(data);
        }
      } catch (err) {
        err.message = 'error parsing ' + filename + ': ' + err.message;
        return callback(err);
      }
      callback(null, result);
    }
  });
}

var Backend = function () {
  function Backend(services) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    (0, _classCallCheck3.default)(this, Backend);

    this.init(services, options);

    this.type = 'backend';
  }

  (0, _createClass3.default)(Backend, [{
    key: 'init',
    value: function init(services) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var coreOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      this.services = services;
      this.options = this.options || {};
      this.options = (0, _assign2.default)({}, getDefaults(), this.options, options);
      this.coreOptions = coreOptions;
      this.queuedWrites = {};

      // Initialize Qordoba
      if ((0, _keys2.default)(options).length !== 0 && process.env.tests !== 'running') {
        console.log('Initializing Qordoba');
        qordoba.initQordoba(options, this);
      }

      this.debouncedWrite = utils.debounce(this.write, 250);
    }
  }, {
    key: 'read',
    value: function read(language, namespace, callback) {
      var filename = this.services.interpolator.interpolate(this.options.loadPath, { lng: language, ns: namespace });
      readFile(filename, function (err, resources) {
        if (err) return callback(err, false); // no retry
        callback(null, resources);
      });
    }
  }, {
    key: 'create',
    value: function create(languages, namespace, key, fallbackValue, callback) {
      var _this = this;

      if (!callback) callback = function callback() {};
      if (typeof languages === 'string') languages = [languages];

      var todo = languages.length;
      function done() {
        if (! --todo) callback && callback();
      }

      languages.forEach(function (lng) {
        _this.queue.call(_this, lng, namespace, key, fallbackValue, done);
      });
    }

    // write queue

  }, {
    key: 'write',
    value: function write() {
      for (var lng in this.queuedWrites) {
        var namespaces = this.queuedWrites[lng];
        if (lng !== 'locks') {
          for (var ns in namespaces) {
            this.writeFile(lng, ns);
          }
        }
      }
    }
  }, {
    key: 'writeFile',
    value: function writeFile(lng, namespace) {
      var _this2 = this;

      var lock = utils.getPath(this.queuedWrites, ['locks', lng, namespace]);
      if (lock) return;

      var filename = this.services.interpolator.interpolate(this.options.addPath, { lng: lng, ns: namespace });

      var missings = utils.getPath(this.queuedWrites, [lng, namespace]);
      utils.setPath(this.queuedWrites, [lng, namespace], []);

      if (missings.length) {
        // lock
        utils.setPath(this.queuedWrites, ['locks', lng, namespace], true);

        readFile(filename, function (err, resources) {
          if (err) resources = {};

          missings.forEach(function (missing) {
            utils.setPath(resources, missing.key.split(_this2.coreOptions.keySeparator || '.'), missing.fallbackValue);
          });

          _fs2.default.writeFile(filename, (0, _stringify2.default)(resources, null, _this2.options.jsonIndent), function (err) {
            // unlock
            utils.setPath(_this2.queuedWrites, ['locks', lng, namespace], false);

            missings.forEach(function (missing) {
              if (missing.callback) missing.callback();
            });

            // rerun
            _this2.debouncedWrite();
          });
        });
      }
    }
  }, {
    key: 'queue',
    value: function queue(lng, namespace, key, fallbackValue, callback) {
      utils.pushPath(this.queuedWrites, [lng, namespace], { key: key, fallbackValue: fallbackValue || '', callback: callback });

      this.debouncedWrite();
    }
  }]);
  return Backend;
}();

Backend.type = 'backend';

exports.default = Backend;