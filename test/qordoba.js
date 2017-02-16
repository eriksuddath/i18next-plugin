const expect = require('chai').expect;
const fs = require('fs-extra');

// import config options
const configOptions = require('./testConfig');
const { loadPath, i18nPath, sourceLanguage } = configOptions;

// import qordoba to test private methods
const _Q = require('./../lib/Qordoba')._funcs(configOptions);
const {     
    incrementQueue,
    decrementQueue,
    checkQueuesForItems,
    makeDirectory,
    readDirectory,
    writeFile,
    pipeFile,
    delay,
    watchSourceFiles,
    initialize,
    getSourceData,
    writeSourceData,
    updateSourceData,
    getTargetData,
    writeTargetData,
    updateTimestamp,
    getFileId,
    getTimestamp,
    uploadFile,
    updateFile,
    addToUploadQueue,
    addToUpdateQueue,
    syncSourceFiles,
    getTargetLangs,
    getTargetFiles,
    getJsonFromQordoba,
    lockFile,
    unlockFile,
    isLocked,
    reloadResources,
    downloadFile,
    getFilesFromQordoba,
    syncTargetFiles
} = _Q;


// set some mock globals to refer to
const qLocalesPath = loadPath.split('/').slice(0, 4).join('/');
const sourceFiles = `${i18nPath}/${sourceLanguage}`;

const mockSourceData = {
  "test.json": {
    "fileId": 736287,
    "lastModified": 1486429899000,
    "filepath": "./test/locales/i18next/en/common.json"
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

describe('file helpers', () => {

  const path = `${qLocalesPath}/blah`;
  before( () => fs.emptyDirSync(path) );

  describe('makeDirectory', () => {

    it('should make a directory given a path', () => {
      makeDirectory(path);
      const exists = fs.existsSync(path);
      expect(exists).to.eql(true);
    })

  })

  describe('readDirectory', () => {

    it('should read files in a directory', () => {
      const files = readDirectory(path);
      expect(files).to.eql([]);
    })

  })


  describe('writeFile', () => {

    it('should write a file to a directory', () => {
      const filepath = `${path}/blah.json`;
      // overwrite set to true
      writeFile(filepath, { hey: 'ho' }, true);

      const file = fs.readFileSync(filepath, 'utf-8');
      expect(JSON.parse(file)).to.eql({ hey: 'ho' });
    })

  })

  describe('writeFile', () => {

    it('should write a file to a directory', () => {
      const filepath = `${path}/blah.json`;
      // overwrite set to true
      writeFile(filepath, { hey: 'ho' }, true);

      const file = fs.readFileSync(filepath, 'utf-8');
      expect(JSON.parse(file)).to.eql({ hey: 'ho' });
    })

  })

  after( () => fs.emptyDirSync(path) )
})


describe('initialization', () => {
  before( (done) => {
    // make sure qordoba directory is empty before all tests
    fs.emptyDirSync(qLocalesPath,  (err) => {
      if (err) console.log('error emptying directory!')
    });

    // initialize direcotires for tests
    const initialize = _Q.initialize.bind(this);
    initialize();

    // wait for directories to be created
    setTimeout(done, 1000)
  })

  it('initialize file data', () => {
    const fileDataExists = fs.existsSync(`${qLocalesPath}/files`);
    expect(fileDataExists).to.equal(true);

  });

  it('copy source language files into qordoba directory', () => {
    const copiedData = fs.readFileSync(`${qLocalesPath}/en/test.json`, 'utf-8');
    expect(copiedData).to.eql(JSON.stringify({ "foo": "bar" }, null, 2));
  }); 

});


describe('source / target data helpers', () => {
  const source = `${qLocalesPath}/files/source.json`;
  const target = `${qLocalesPath}/files/target.json`;

  // write some fake data to fs for testing
  before( () => writeFile(source, mockSourceData, true) )

  describe('getSourceData', () => {

    it('should get file metadata from fs', () => {
      const sourceData = getSourceData();
      expect(sourceData).to.eql(mockSourceData);
    })

  })

  describe('writeSourceData', () => {

    it('should write file metadata to fs', () => {
      writeSourceData({ hey: 'ho' });
      const sourceData = getSourceData();
      expect(sourceData).to.eql({ hey: 'ho' });

      writeSourceData(mockSourceData);
      const newSourceData = getSourceData();
      expect(newSourceData).to.eql(mockSourceData);
    })

  })

  describe('updateSourceData', () => {
    before( () => writeSourceData(mockSourceData) );

    it('should adds file metadata after successful file upload', () => {
      updateSourceData('test2.json', 11111)
      const sourceData = getSourceData();
      expect(sourceData).to.eql({ 'test.json': { fileId: 736287, lastModified: 1486429899000, filepath: './test/locales/i18next/en/common.json' },'test2.json': { fileId: 11111, lastModified: 1487100199000, filepath: './test/locales/i18next/en/test2.json' } })
    })

  })

  describe('getTargetData', () => {
    before( () => writeFile(target, mockTargetData, true) );
    
    it('should get target language metadata', () => {
      const targetData = getTargetData();
      expect(targetData).to.eql(mockTargetData);
    })

  })

  describe('writeTargetData', () => {
    
    it('should write target language metadata', () => {
      writeTargetData({ perfectDay: 'bananafish'})
      const targetData = getTargetData();
      expect(targetData).to.eql({ perfectDay: 'bananafish'});
    })

  })

  describe('updateTimestamp', () => {
    before( () => writeFile(target, mockTargetData, true) );
    
    it('should update target file timestamp', () => {
      const lg = 'da';
      const ns = 'jumbo.json';
      updateTimestamp(lg, ns, 1984);

      const targetData = getTargetData();
      expect(targetData[lg][ns]).to.eql(1984);
    })

  })

})


describe('upload / update source files', () => {
  before( () => writeSourceData(mockSourceData) );

  describe('getFileId', () => {
    it('should get file id from filename', () => {
      const file = 'test.json';
      const id = getFileId(file);
      expect(id).to.eql(736287);
    })
  })

  describe('getTimestamp', () => {
    it('should get timestamp of source file', () => {
      const file = 'test.json';
      const timestamp = getTimestamp(file);
      expect(timestamp).to.exist;
      expect(timestamp).to.be.a('number');
    })
  })

})

describe('download files', () => {
  before( () => writeSourceData(mockSourceData) );

  describe('lockFile', (lg, ns) => {
    it('should lock file from being downloaded', () => {
      lockFile('es', 'blah.json');
      const status = isLocked('es', 'blah.json');
      expect(status).to.eql(true);
    })
  })

  describe('unlockFile', (lg, ns) => {
    it('should unlock file from being downloaded', () => {
      unlockFile('es', 'blah.json');
      const status = isLocked('es', 'blah.json');
      expect(status).to.eql(false);
    })
  })

  describe('isLocked', (lg, ns) => {
    it('should check if a file is locked', () => {
      lockFile('es', 'blah.json');
      const status = isLocked('es', 'blah.json');
      expect(status).to.eql(true)
    })
  })
})

describe('upload queue', () => {

  describe('incrementQueue', (lg, ns) => {
    it('should increase queue length by one', () => {
      incrementQueue('upload');
      incrementQueue('upload');
      incrementQueue('update');
      const status = checkQueuesForItems()
      expect(status).to.be.true;
    })
  })

  describe('decrementQueue', (lg, ns) => {
    it('should decrease queue length by one', () => {
      decrementQueue('upload');
      decrementQueue('upload');
      decrementQueue('update');
      const status = checkQueuesForItems();
      expect(status).to.be.false
    })
  })

  describe('checkQueuesForItems', (lg, ns) => {
    it('should check if there are items in queue', () => {
      incrementQueue('upload');
      const status = checkQueuesForItems();
      expect(status).to.be.true;
    })
  })
})
