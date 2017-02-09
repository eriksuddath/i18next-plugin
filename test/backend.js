var expect = require('chai').expect;
var fs = require('fs-extra');
var Interpolator = require('i18next/dist/commonjs/Interpolator').default;
var _Q = require('./../lib/Qordoba')._funcs();

// set some mock globals to refer to
const pathToQordobaLocales = './test/locales/qordoba';
const pathToSourceLanguage = './test/locales/i18next/en';

describe('backend', function() {
  var backend;

  before(function(done) {
    // make sure qordoba directory is empty before all tests
    fs.emptyDirSync('./test/locales/qordoba',  (err) => {
      if (err) console.log('error emptying directory!')
    });

    // initialize direcotires for tests
    const { initialize } = _Q;
    initialize(pathToQordobaLocales, pathToSourceLanguage);

    // wait for directories to be created
    setTimeout(done, 1000)

    var Backend = require('../lib').default;
    backend = new Backend({
      interpolator: new Interpolator()
    }, {
      loadPath: __dirname + '/locales/qordoba/{{lng}}/{{ns}}.json',
      addPath: __dirname + '/locales/qordoba/{{lng}}/{{ns}}.missing.json'
    });

  });

  it('read', function(done) {
    backend.read('en', 'test', function(err, data) {
      expect(err).to.be.not.ok;
      expect(data).to.eql({foo: 'bar'});
      done();
    });
  });


  it('create simple', function(done) {
    backend.create('en', 'test', 'some.key', 'myDefault', function() {
      done();
    });
  });

  it('create multiple', function(done) {
    backend.create('en', 'test2', 'key1', '1')
    backend.create('en', 'test2', 'key2', '2')
    backend.create('en', 'test2', 'key3', '3')
    backend.create('en', 'test2', 'key4', '4', function() {
      done();
    });
  });

  it('create multiple - with pause', function(done) {
    backend.create('en', 'test3', 'key1', '1')
    backend.create('en', 'test3', 'key2', '2', function() {
      setTimeout(function () {
        backend.create('en', 'test3', 'key3', '3')
        backend.create('en', 'test3', 'key4', '4', function() {
          done();
        });
      }, 200);
    });
  });

  it('create multiple with multiple languages to write to (saveMissingTo=all)', function(done) {
    
    backend.create(['en', 'de'], 'test4', 'key1', '1')
    backend.create(['en', 'de'], 'test4', 'key2', '2')
    backend.create(['en', 'de'], 'test4', 'key3', '3')
    backend.create(['en', 'de'], 'test4', 'key4', '4', function() {
      const dirs = fs.readdirSync(__dirname + '/locales/qordoba/en', 'utf8')
      expect(dirs.length).to.equal(6);
      done();
    });

  });

});