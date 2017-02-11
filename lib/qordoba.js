'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.initQordoba = initQordoba;
exports._funcs = _funcs;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

var _fsPromise = require('fs-promise');

var _fsPromise2 = _interopRequireDefault(_fsPromise);

var _chokidar = require('chokidar');

var _chokidar2 = _interopRequireDefault(_chokidar);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
===================================
GLOBAL VARIABLES
===================================
*/

var i18n = void 0,
    projectId = void 0,
    organizationId = void 0,
    xAuthToken = void 0,
    consumerKey = void 0,
    qordobaPath = void 0,
    i18nPath = void 0,
    milestoneId = void 0,
    syncInterval = void 0,
    sourceLanguage = void 0;
var FILE_TYPE = 'JSON';
var FILE_VERSION = '4.22';
var MILESTONE = 'Translating';
var DOWNLOAD_BUFFER = 10000;
var sourceFiles = void 0;
/*
===================================
INITIALIZE
===================================
*/

// queues to attach promises
var updateQueue = _promise2.default.resolve();
var updateQueueLength = 0;

var uploadQueue = _promise2.default.resolve();
var uploadQueueLength = 0;

// download cache (for error handling)
var currentDownloads = {};

var incrementQueue = function incrementQueue(q) {
  return q === 'update' ? updateQueueLength += 1 : uploadQueueLength += 1;
};
var decrementQueue = function decrementQueue(q) {
  return q === 'update' ? updateQueueLength -= 1 : uploadQueueLength -= 1;
};
var checkQueuesForItems = function checkQueuesForItems(q) {
  return uploadQueueLength > 0 || updateQueueLength > 0 ? true : false;
};

/*
===================================
FILE HELPERS
===================================
*/

var makeDirectory = function makeDirectory(path) {
  if (!_fs2.default.existsSync(path)) {
    _fs2.default.mkdirSync(path);
    return true;
  }
  return false;
};

var readDirectory = function readDirectory(path) {
  var files = _fs2.default.readdirSync(sourceFiles);
  return files;
};

var writeFile = function writeFile(path, data, overwrite) {
  if (overwrite || !_fs2.default.existsSync(path)) {
    _fs2.default.writeFileSync(path, (0, _stringify2.default)(data, null, 2));
  }
};

var pipeFile = function pipeFile(path, newPath) {
  return _fsPromise2.default.createReadStream(path).pipe(_fsPromise2.default.createWriteStream(newPath));
};

var delay = function delay(t) {
  console.log('Delaying ' + t + ' milliseconds to prevent server error');
  return new _promise2.default(function (resolve) {
    setTimeout(resolve, t);
  });
};

var watchSourceFiles = function watchSourceFiles(path) {
  console.log('Watching source files directory:', path);
  var watcher = _chokidar2.default.watch(path, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  watcher.on('change', function (path, stats) {
    console.log('Source files changed. Uploading to qordoba');
    console.log('NEED TO ALSO COPY CHANGES OVER TO i18n source dir');
    syncSourceFiles();
  });
};

var initialize = function initialize(qordobaPath, i18nPath) {
  // make sure qordoba files dir exists
  makeDirectory(qordobaPath);

  // make sure qordoba files dir exists
  makeDirectory(qordobaPath + '/files');

  // make sure source metadata store exists
  writeFile(qordobaPath + '/files/source.json', {}, false);

  // make sure source language dir exists in a qordoba locales
  sourceFiles = i18nPath + '/' + sourceLanguage;
  var sourceTarget = qordobaPath + '/' + sourceLanguage;

  if (makeDirectory(sourceTarget)) {
    // copy source langage files into qordoba folder
    var files = _fs2.default.readdirSync(sourceFiles);
    return _promise2.default.all(files.map(function (file, i) {
      var path = sourceFiles + '/' + file;
      var newPath = sourceTarget + '/' + file;
      return pipeFile(path, newPath);
    }));
  }

  // start watcher for source files
  watchSourceFiles(sourceFiles);

  return _promise2.default.resolve();
};

/*
===================================
SOURCE / TARGET DATA HELPERS
===================================
*/

// gets file metadata from fs
var getSourceData = function getSourceData() {
  var path = qordobaPath + '/files/source.json';
  return JSON.parse(_fs2.default.readFileSync(path, 'utf8'));
};

// write file metadata to fs
var writeSourceData = function writeSourceData(data) {
  var path = qordobaPath + '/files/source.json';
  return writeFile(path, data, true);
};

// adds file metadata after successful file upload
var updateSourceData = function updateSourceData(file, fileId, filepath, qordobaPath, sourceFiles) {
  var data = getSourceData(qordobaPath);
  var lastModified = getTimestamp(file, sourceFiles);
  data[file] = { fileId: fileId, lastModified: lastModified, filepath: filepath };
  return writeSourceData(data, qordobaPath);
};

// get target language metadata
var getTargetData = function getTargetData() {
  var targetData = qordobaPath + '/files/target.json';
  if (!_fs2.default.existsSync(targetData)) {
    _fs2.default.writeFileSync(targetData, (0, _stringify2.default)({}));
  }

  return JSON.parse(_fs2.default.readFileSync(targetData, 'utf8'));
};

// write target language metadata
var writeTargetData = function writeTargetData(data, qordobaPath) {
  var path = qordobaPath + '/files/target.json';
  writeFile(path, data, true);
};

// update target file timestamp
var updateTimestamp = function updateTimestamp(lg, ns, newTimestamp, qordobaPath) {
  var data = getTargetData(qordobaPath);
  if (data[lg] === undefined) {
    data[lg] = {};
  };
  data[lg][ns] = newTimestamp;
  writeTargetData(data, qordobaPath);
};

/*
===================================
UPLOAD / UPDATE SOUCE FILES
===================================
*/

// gets file id from filename
var getFileId = function getFileId(file, qordobaPath) {
  var data = getSourceData(qordobaPath);
  return data[file]['fileId'];
};

// gets timestamp of file
var getTimestamp = function getTimestamp(file, sourceFiles) {
  var path = sourceFiles + '/' + file;
  var stats = _fs2.default.statSync(path);
  return stats.mtime.valueOf();
};

// handles file upload
var uploadFile = function uploadFile(filepath, type, versionTag) {
  var options = {
    method: 'POST',
    url: 'https://devapi.qordoba.com/v2/files/upload',
    qs: { type: type },
    headers: { versionTag: versionTag, projectId: projectId, organizationId: organizationId, consumerKey: consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: {
      file: _fsPromise2.default.createReadStream(filepath),
      file_names: '[]'
    }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return JSON.parse(body).files_ids[0];
  }).catch(function (err) {
    return console.log(err);
  });
};

// handles file update
var updateFile = function updateFile(fileId, filePath) {
  var options = {
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/update',
    headers: { fileId: fileId, projectId: projectId, consumerKey: consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: {
      file: _fsPromise2.default.createReadStream(filePath)
    }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return JSON.parse(body).files_ids[0];
  }).catch(function (err) {
    return console.log(err);
  });
};

// adds file to upload promise queue
var addToUploadQueue = function addToUploadQueue(file) {
  var path = sourceFiles + '/' + file;

  incrementQueue('upload');
  uploadQueue = uploadQueue.then(function () {
    return delay(7000).then(function () {
      return uploadFile(path, FILE_TYPE, FILE_VERSION);
    }).then(function (fileId) {
      console.log('Successfully uploaded ' + file);
      updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
      setTimeout(function () {
        return decrementQueue('upload');
      }, DOWNLOAD_BUFFER);
    }).catch(function (_ref) {
      var body = _ref.body;
      return console.log(body);
    });
  });
};

// adds file to update promise queue
var addToUpdateQueue = function addToUpdateQueue(file) {
  var id = getFileId(file, qordobaPath);
  var path = sourceFiles + '/' + file;

  incrementQueue('update');
  updateQueue = updateQueue.then(function () {
    return delay(7000).then(function () {
      return updateFile(id, path);
    }).then(function (fileId) {
      console.log('Successfully updated ' + file);
      updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
      setTimeout(function () {
        return decrementQueue('update');
      }, DOWNLOAD_BUFFER);
    }).catch(function (_ref2) {
      var body = _ref2.body;
      return console.log(body);
    });
  });
};

// checks for new uploads / updates, sends files to queue
var syncSourceFiles = function syncSourceFiles() {
  var data = getSourceData(qordobaPath);
  var files = readDirectory(sourceFiles);

  files.forEach(function (file) {
    var timestamp = getTimestamp(file, sourceFiles);
    var currentFile = data[file];

    if (currentFile === undefined) {
      addToUploadQueue(file);
    } else if (Number(currentFile.lastModified) !== Number(timestamp)) {
      addToUpdateQueue(file);
    }
  });
};

/*
===========================================
DOWNLOAD TARGET FILES
===========================================
*/

// get target language ids and codes
var getTargetLangs = function getTargetLangs() {
  var options = {
    method: 'GET',
    url: 'https://api.qordoba.com/v2/projects/detail',
    headers: { consumerKey: consumerKey, projectId: projectId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return JSON.parse(body).targetLanguages.map(function (tl) {
      return {
        lg: tl.targetCode.slice(0, 2),
        langId: tl.targetId
      };
    });
  }).catch(function (_ref3) {
    var body = _ref3.body;
    return console.log(body);
  });
};

// get namespaces and fileIds
var getTargetFiles = function getTargetFiles() {
  var data = getSourceData(qordobaPath);
  var files = (0, _keys2.default)(data);
  return files.map(function (file) {
    return {
      ns: file,
      fileId: data[file]['fileId']
    };
  });
};

// get id of specified milestone (new one)
var getMilestoneId = function getMilestoneId() {
  var options = {
    url: 'https://api.qordoba.com/v2/projects/workflow',
    headers: { consumerKey: consumerKey, projectId: projectId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    var milestones = JSON.parse(body).milestones;
    // set to global to limit API calls
    milestoneId = milestones.filter(function (ms) {
      return ms.milestoneName === MILESTONE;
    })[0].milestoneId;
    return milestoneId;
  }).catch(function (err) {
    return console.log(err);
  });
};

// get fileids and timestamp from qordoba by languageId (new One)
var getQordobaTimestamps = function getQordobaTimestamps(languageId) {
  var options = {
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/list',
    headers: { consumerKey: consumerKey, languageId: languageId, projectId: projectId, 'content-type': 'application/json' },
    body: {},
    json: true
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    var obj = {};
    body.forEach(function (_ref4) {
      var fileId = _ref4.fileId,
          updated = _ref4.updated;
      return obj[fileId] = updated;
    });
    return obj;
  }).catch(function (_ref5) {
    var body = _ref5.body;
    return console.log(body);
  });
};

// get all Qordoba timestamps
var getAllQordobaTimestamps = function getAllQordobaTimestamps(languages, files) {
  var timestamps = [];
  languages.forEach(function (_ref6) {
    var lg = _ref6.lg,
        langId = _ref6.langId;
    return timestamps.push(getQordobaTimestamps(langId));
  });
  return _promise2.default.all(timestamps).then(function (timestamps) {
    var obj = {};
    timestamps.forEach(function (timestamp, idx) {
      var langId = languages[idx]['langId'];
      obj[langId] = timestamp;
    });
    return obj;
  });
};

// get JSON data from Qordoba (new one)
var getJsonFromQordoba = function getJsonFromQordoba(languageId, fileId, milestoneId) {
  var url = 'https://api.qordoba.com/v2/files/json';
  var options = {
    method: 'GET',
    url: url,
    headers: { consumerKey: consumerKey, projectId: projectId, languageId: languageId, fileId: fileId, milestoneId: milestoneId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    console.log('type of body', typeof body === 'undefined' ? 'undefined' : (0, _typeof3.default)(body));
    return JSON.parse(body);
  }).catch(function (err) {
    return console.log(err);
  });
};

// lock files already being downloaded
var lockFile = function lockFile(lg, ns) {
  return currentDownloads[lg + '|' + ns] = true;
};
var unlockFile = function unlockFile(lg, ns) {
  return currentDownloads[lg + '|' + ns] = false;
};
var isLocked = function isLocked(lg, ns) {
  return currentDownloads[lg + '|' + ns] ? true : false;
};

// reload resources after downlaod
var reloadResources = function reloadResources(lg, ns) {
  var namespace = ns.split('.')[0];
  i18n.services.backendConnector.read(lg, namespace, 'read', null, null, function (err, data) {
    if (err) i18n.services.backendConnector.logger.warn('loading namespace ' + ns + ' for language ' + lg + ' failed', err);
    if (!err && data) i18n.services.backendConnector.logger.log('loaded namespace ' + ns + ' for language ' + lg, data);

    console.log('Reloading resources for ' + lg + '|' + namespace);
    i18n.services.backendConnector.loaded(lg + '|' + namespace, err, data);
  });
};

// handle download process
var downloadFile = function downloadFile(lg, langId, ns, fileId, newTimestamp, milestoneId, qordobaPath) {
  var path = qordobaPath + '/' + lg + '/' + ns;

  lockFile(lg, ns);
  return getJsonFromQordoba(langId, fileId, milestoneId).then(function (data) {
    console.log('Writing file data', data);
    writeFile(path, data, true);
    updateTimestamp(lg, ns, newTimestamp, qordobaPath);
    reloadResources(lg, ns);
    unlockFile(lg, ns);
    console.log('Downloaded namespace: ' + ns + ' for language: ' + lg);
  });
};

// sync all target language files
var syncTargetFiles = function syncTargetFiles() {
  if (checkQueuesForItems()) {
    return;
  }

  var files = getTargetFiles();
  var data = getTargetData();
  var languages = void 0;

  // get taget languages and milestoneId from qordoba
  _promise2.default.all([getTargetLangs(), milestoneId || getMilestoneId()])

  // use languages to get timestamps for all qordoba files
  .then(function (result) {
    languages = result[0];
    return getAllQordobaTimestamps(languages, files);
  })

  // iterate through languages, compare timestamps, update if different
  .then(function (qTimestamps) {

    languages.forEach(function (_ref7) {
      var lg = _ref7.lg,
          langId = _ref7.langId;

      if (data[lg] === undefined) {
        data[lg] = {};
      };

      makeDirectory(qordobaPath + '/' + lg);
      files.forEach(function (_ref8) {
        var ns = _ref8.ns,
            fileId = _ref8.fileId;

        if (data[lg][ns] === undefined) {
          data[lg][ns] = null;
        };

        var qTimestamp = qTimestamps[langId][fileId];
        var fsTimestamp = data[lg][ns];

        // check timestamps and make sure file isn't currently being downloaded
        if (fsTimestamp !== qTimestamp && !isLocked(lg, ns)) {
          downloadFile(lg, langId, ns, fileId, qTimestamp, milestoneId, qordobaPath);
        }
      });
    });
  });
};

/*
===========================================
INITIALIZE QORDOBA OBJECT AND VARS
===========================================
*/

function initQordoba(options, i18next) {
  organizationId = options.organizationId;
  projectId = options.projectId;
  xAuthToken = options.xAuthToken;
  consumerKey = options.consumerKey;
  qordobaPath = options.loadPath.split('/').slice(0, -2).join('/');
  i18nPath = options.i18nPath;
  sourceLanguage = options.sourceLanguage;
  syncInterval = options.syncInterval;
  i18n = i18next;

  // initialize file structure
  initialize(qordobaPath, i18nPath).then(function () {
    syncSourceFiles();
    // handle interval
    var _syncInterval = syncInterval,
        interval = _syncInterval.interval,
        seconds = _syncInterval.seconds;

    if (interval === true) {
      setInterval(syncTargetFiles, seconds * 1000);
      console.log('Interval set to', seconds, 'seconds');
    }
    // syncTargetFiles
    syncTargetFiles();
  }).catch(function (err) {
    return console.log(err);
  });
}

// export private methods for testing
function _funcs() {
  return {
    initialize: initialize,
    delay: delay,
    watchSourceFiles: watchSourceFiles,
    getSourceData: getSourceData,
    writeFileData: writeFileData,
    getFileId: getFileId,
    getTimestamp: getTimestamp,
    updateSourceData: updateSourceData,
    uploadFile: uploadFile,
    addToUploadQueue: addToUploadQueue,
    syncSourceFiles: syncSourceFiles,
    writeFile: writeFile,
    getTargetLangs: getTargetLangs,
    getNamespaces: getNamespaces,
    getMilestoneId: getMilestoneId,
    getTargetData: getTargetData,
    writeTargetData: writeTargetData,
    getQordobaTimestamps: getQordobaTimestamps,
    getAllQordobaTimestamps: getAllQordobaTimestamps,
    getJsonFromQordoba: getJsonFromQordoba,
    updateTimestamp: updateTimestamp,
    reloadResources: reloadResources,
    processDownload: processDownload,
    syncTargetFiles: syncTargetFiles
  };
}

// exports.syncSourceFiles = syncSourceFiles;
// exports.syncTargetFiles = syncTargetFiles;