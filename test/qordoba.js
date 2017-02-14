var expect = require('chai').expect;
var fs = require('fs-extra')

// import qordoba to test private methods
var _Q = require('./../lib/Qordoba')._funcs({
  // path to qordoba folder where resources will get loaded from
  loadPath: './test/locales/qordoba/{{lng}}/{{ns}}.json',

  // path to post missing resources
  addPath: './test/locales/qordoba/{{lng}}/{{ns}}.missing.json',

  // jsonIndent to use when storing json files
  jsonIndent: 2,

  // qordoba organization id
  organizationId: 3036,

  // qordoba project id
  projectId: 3789,

  // id of workflow milestone to pull translations from
  milestoneId: 1111,

  // qordoba customer key
  consumerKey: 'ooGM5l9ojTag4osd7V72SPaxmjtyH8Ww',

  // path to project source language in i18next locales folder
  i18nPath: './test/locales/i18next',

  // source language for project
  sourceLanguage: 'en',

  // provide an optional interval to sync target language files
  syncInterval: { interval: true, seconds: 10 }
})

// set some mock globals to refer to
const qLocalesPath = './test/locales/qordoba';
const pathToSourceLanguage = './test/locales/i18next/en';
const sourceLanguageDir = './test/locales/qordoba/en';
const mockSourceData = {
  "test.json": {
    "fileId": 736287,
    "lastModified": 1486429899000,
    "filepath": "./test/locales/qordoba/en/common.json"
  }
}
const mockTargetData = {
  "da": {
    "jumbo.json": 1486402559000,
    "common.json": 1486467858000
  },
  "es": {
    "jumbo.json": 1486403311000,
    "common.json": 1486467724000
  }
}

describe('initialization', () => {
  before( (done) => {
    // make sure qordoba directory is empty before all tests
    fs.emptyDirSync('./test/locales/qordoba',  (err) => {
      if (err) console.log('error emptying directory!')
    });

    // initialize direcotires for tests
    const initialize = _Q.initialize.bind(this);
    initialize(qLocalesPath, pathToSourceLanguage);

    // wait for directories to be created
    setTimeout(done, 1000)
  })

  it('initialize file data', () => {
    const fileDataExists = fs.existsSync('./test/locales/qordoba/files');
    expect(fileDataExists).to.equal(true);

  });

  it('copy source language files into qordoba directory', () => {
    const copiedData = fs.readFileSync('./test/locales/qordoba/en/test.json', 'utf-8');
    expect(copiedData).to.eql(JSON.stringify({ "foo": "bar" }, null, 2));
  }); 

});

describe('upload', () => {

  it('write file data to fs', () => {
    const { writeFileData } = _Q;
    // write some fake data to fs
    writeFileData(mockSourceData, qLocalesPath);

    const fileData = fs.readFileSync(`${qLocalesPath}/files/source.json`, 'utf8')
    expect(fileData).to.eql(JSON.stringify(mockSourceData, null, 2))
  })

  it('read fileData', () => {
    const { getFileData } = _Q;
    const data = getFileData(qLocalesPath);
    expect(data).to.eql(mockSourceData)
  })

  it('get file id', () => {
    const { getFileId } = _Q;
    const id = getFileId('test.json', qLocalesPath);
    expect(id).to.eql(736287)
  })

  it('updates file data after upload', () => {
    const { addFileData, getFileData } =_Q;
    const file = 'test2.json';
    const fileId = 111111;
    const filepath = `${pathToSourceLanguage}/${file}`;

    // add file data to source.json
    addFileData(file, fileId, filepath, qLocalesPath, sourceLanguageDir);

    // make sure file data has been added correctly
    const fileData = JSON.parse(fs.readFileSync(`${qLocalesPath}/files/source.json`, 'utf8'))
    const checkId = fileData[file].fileId;
    const checkPath = fileData[file].filepath;
    expect(fileId === checkId && filepath === checkPath).to.eql(true);
  })

});

describe('download', () => {
  it('write target language dir', () => {
    const { writeDirectory } = _Q;
    writeDirectory('da', qLocalesPath);
    const exists = fs.existsSync(`${qLocalesPath}/da`);
    expect(exists).to.eql(true)
  })
  // getTargetData
  it('get target data ', () => {
    const { getTargetData } = _Q;
    const data = getTargetData(qLocalesPath);
    expect(data).to.eql({})
  })
  // writeTargetData
  it('write target data ', () => {
    const { writeTargetData, getTargetData } = _Q;
    writeTargetData(mockTargetData, qLocalesPath);
    const checkData = getTargetData(qLocalesPath);
    expect(checkData).to.eql(mockTargetData)
  })

  // writeNewTimestamp
  it('write new timestamp to targetData', () => {
    const { writeNewTimestamp, getTargetData } = _Q;
    writeNewTimestamp('es', 'common.json', 1984, qLocalesPath);
    const checkTimestamp = getTargetData(qLocalesPath)['es']['common.json'];
    expect(checkTimestamp).to.eql(1984)
  })

});

  // before((d =>one) {
  //   // setup some stuff
  //   i18n = i18next
  //   .use(qordobabackend)
  //   .init({
  //     backend: {
  //       // path to qordoba folder where resources will get loaded from
  //       loadPath: './test/locales/qordoba/{{lng}}/{{ns}}.json',

  //       // path to post missing resources
  //       addPath: './test/locales/qordoba/{{lng}}/{{ns}}.missing.json',

  //       // jsonIndent to use when storing json files
  //       jsonIndent: 2,

  //       // qordoba organization id
  //       organizationId: 3036,

  //       // qordoba project id
  //       projectId: 3711,

  //       // xAuthToken => to be removed when API stabilizes
  //       xAuthToken: '2c116052-e424-421f-aa72-b50e9291fe10',

  //       // qordoba customer key
  //       consumerKey: 'ooGM5l9ojTag4osd7V72SPaxmjtyH8Ww',

  //       // path to project source language in i18next locales folder
  //       pathToSourceLanguage: './locales/i18next/en',

  //       // provide an optional interval to sync target language files
  //       syncTargetLanguageFiles: { interval: true, seconds: 10 }
  //     },
  //     lng: 'en',
  //     ns: 'common'
  //   })

  //   setTimeout(done, 1000);
  // });
