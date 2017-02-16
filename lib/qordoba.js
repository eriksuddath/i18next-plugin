'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

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

var _mergeDirs = require('merge-dirs');

var _mergeDirs2 = _interopRequireDefault(_mergeDirs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
===================================
GLOBAL VARIABLES
===================================
*/

var i18n = void 0,
    projectId = void 0,
    organizationId = void 0,
    sourceFiles = void 0,
    consumerKey = void 0,
    qordobaPath = void 0,
    i18nPath = void 0,
    milestoneId = void 0,
    syncInterval = void 0,
    sourceLanguage = void 0,
    debug = void 0;
// need to test not JSON filetypes
var FILE_TYPE = 'JSON';
var FILE_VERSION = '4.22';
var DOWNLOAD_BUFFER = 10000;

var logger = function logger(message) {
  var data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  if (debug !== true) {
    return;
  }
  console.log('\n');
  console.log('logger :: ' + message);
  if (data !== '') console.log('data :: ' + (0, _stringify2.default)(data, null, 2));
};

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
  var files = _fs2.default.readdirSync(path);
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
  logger('Delaying ' + t + ' milliseconds to prevent server error');
  return new _promise2.default(function (resolve) {
    setTimeout(resolve, t);
  });
};

var watchSourceFiles = function watchSourceFiles(sourcepath, target) {
  logger('Watching source files directory: ' + sourcepath);
  var watcher = _chokidar2.default.watch(sourcepath, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  watcher.on('change', function (path, stats) {
    // upload source files to qordoba
    syncSourceFiles();
    // merge changes into qordoba folder
    (0, _mergeDirs2.default)(sourcepath, target, 'overwrite');
  });
};

var initialize = function initialize() {
  // make sure qordoba files dir exists
  makeDirectory(qordobaPath);

  // make sure qordoba files dir exists
  makeDirectory(qordobaPath + '/files');

  // make sure source metadata store exists
  writeFile(qordobaPath + '/files/source.json', {}, false);

  // make sure source language dir exists in a qordoba locales
  sourceFiles = i18nPath + '/' + sourceLanguage;
  var sourceTarget = qordobaPath + '/' + sourceLanguage;

  // start watcher for source files
  watchSourceFiles(sourceFiles, sourceTarget);

  // check if source language dir exists in qordoba folder
  if (makeDirectory(sourceTarget)) {
    // if not, copy over source langage files
    var files = _fs2.default.readdirSync(sourceFiles);
    return _promise2.default.all(files.map(function (file, i) {
      var path = sourceFiles + '/' + file;
      var newPath = sourceTarget + '/' + file;
      return pipeFile(path, newPath);
    }));
  }

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
var updateSourceData = function updateSourceData(file, fileId) {
  var data = getSourceData();
  var lastModified = getTimestamp(file, sourceFiles);
  var filepath = sourceFiles + '/' + file;
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
var writeTargetData = function writeTargetData(data) {
  var path = qordobaPath + '/files/target.json';
  writeFile(path, data, true);
};

// update target file timestamp
var updateTimestamp = function updateTimestamp(lg, ns, newTimestamp) {
  logger('updating timestamp for lg: ' + lg + ' and ns: ' + ns + ' with timestamp: ' + newTimestamp);
  var data = getTargetData(qordobaPath);
  if (data[lg] === undefined) {
    data[lg] = {};
  };
  data[lg][ns] = newTimestamp;
  writeTargetData(data);
};

/*
===================================
UPLOAD / UPDATE SOUCE FILES
===================================
*/

// gets file id from filename
var getFileId = function getFileId(file) {
  var data = getSourceData();
  return data[file]['fileId'];
};

// gets timestamp of source file
var getTimestamp = function getTimestamp(file) {
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
    var data = JSON.parse(body);

    if (data.files_ids[0]) logger('uploaded file from filepath ' + filepath, data);
    if (!data.files_ids[0]) logger('failed to retrieve fileId for upload from ' + filepath, data);

    return data.files_ids[0];
  }).catch(function (err) {
    return logger('uploading file from filepath ' + filepath + ' failed', err);
  });
};

// handles file update
var updateFile = function updateFile(fileId, filepath) {
  var options = {
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/update',
    headers: { fileId: fileId, projectId: projectId, consumerKey: consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: {
      file: _fsPromise2.default.createReadStream(filepath)
    }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    if (body.files_ids[0]) logger('updated file from filepath ' + filepath + ' with fileId ' + fileId, body);
    if (!body.files_ids[0]) logger('failed to retrieve fileId for update from ' + filepath + ' with fileId ' + fileId, body);

    return JSON.parse(body).files_ids[0];
  }).catch(function (err) {
    return logger('updating file from filepath ' + filepath + ' failed', err);
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
      logger('Successfully uploaded ' + file);
      updateSourceData(file, fileId);
      setTimeout(function () {
        return decrementQueue('upload');
      }, DOWNLOAD_BUFFER);
    }).catch(function (err) {
      return logger('add to upload queue failed', err);
    });
  });
};

// adds file to update promise queue
var addToUpdateQueue = function addToUpdateQueue(file) {
  var id = getFileId(file);
  var path = sourceFiles + '/' + file;

  incrementQueue('update');
  updateQueue = updateQueue.then(function () {
    return delay(7000).then(function () {
      return updateFile(id, path);
    }).then(function (fileId) {
      logger('Successfully updated ' + file);
      updateSourceData(file, fileId);
      setTimeout(function () {
        return decrementQueue('update');
      }, DOWNLOAD_BUFFER);
    }).catch(function (err) {
      return logger('add to update queue failed', err);
    });
  });
};

// checks for new uploads / updates, sends files to queue
var syncSourceFiles = function syncSourceFiles() {
  var data = getSourceData();
  var files = readDirectory(sourceFiles);

  files.forEach(function (file) {
    var timestamp = getTimestamp(file);
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
    var data = JSON.parse(body);

    if (data.targetLanguages) logger('fetched target languages for projectId: ' + projectId, data);
    if (!data.targetLanguages) logger('failed to retrieve target languages for projectId: ' + projectId, data);

    return data.targetLanguages.map(function (tl) {
      return {
        lg: tl.targetCode.slice(0, 2),
        langId: tl.targetId
      };
    });
  }).catch(function (err) {
    return logger('fetching target languages failed', err);
  });
};

// get namespaces and fileIds
var getTargetFiles = function getTargetFiles() {
  var data = getSourceData();
  var files = (0, _keys2.default)(data);
  return files.map(function (file) {
    return {
      ns: file,
      fileId: data[file]['fileId']
    };
  });
};

// get JSON data from Qordoba (new one)
var getJsonFromQordoba = function getJsonFromQordoba(languageId, fileId) {
  var url = 'https://api.qordoba.com/v2/files/json';
  var options = {
    method: 'GET',
    url: url,
    headers: { consumerKey: consumerKey, projectId: projectId, languageId: languageId, fileId: fileId, milestoneId: milestoneId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    var data = JSON.parse(body);
    if (data) logger('fetched json for fileId ' + fileId + ' and languageId ' + languageId, data);
    return data;
  }).catch(function (err) {
    return logger('fetching json for fileId ' + fileId + ' and languageId ' + languageId + ' failed', err);
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
    if (err) logger('loading namespace ' + ns + ' for language ' + lg + ' failed', err);
    if (!err && data) logger('loaded namespace ' + ns + ' for language ' + lg, data);

    logger('Reloading resources for ' + lg + '|' + namespace);
    i18n.services.backendConnector.loaded(lg + '|' + namespace, err, data);
  });
};

// handle download process
var downloadFile = function downloadFile(lg, langId, ns, fileId, newTimestamp) {
  var path = qordobaPath + '/' + lg + '/' + ns;

  lockFile(lg, ns);
  return getJsonFromQordoba(langId, fileId).then(function (data) {
    makeDirectory(qordobaPath + '/' + lg);
    writeFile(path, data, true);
    updateTimestamp(lg, ns, newTimestamp);
    reloadResources(lg, ns);
    unlockFile(lg, ns);
    logger('Downloaded namespace: ' + ns + ' for language: ' + lg);
  });
};

// get most recent file copies from qordoba
var getFilesFromQordoba = function getFilesFromQordoba(languageId) {
  var options = {
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/list',
    headers: { consumerKey: consumerKey, languageId: languageId, projectId: projectId, 'content-type': 'application/json' },
    body: {},
    json: true
  };

  return (0, _requestPromise2.default)(options).then(function (body) {

    var files = body.reduce(function (obj, _ref) {
      var fileName = _ref.fileName,
          fileId = _ref.fileId,
          updated = _ref.updated;

      if (obj[fileName] === undefined) {
        obj[fileName] = { updated: updated, fileId: fileId };
      }

      if (updated > obj[fileName]['updated']) {
        obj[fileName] = { updated: updated, fileId: fileId };
      }

      return obj;
    }, {});

    if (files) logger('fetched files from qordoba for languageId: ' + languageId, files);
    if (!files) logger('failed to retrieve files for languageId: ' + languageId, files);

    return files;
  }).catch(function (err) {
    return logger('fetching files from qordoba failed', err);
  });
};

// sync target files (new one)
var syncTargetFiles = function syncTargetFiles() {
  logger('synching target files');
  if (checkQueuesForItems()) {
    return;
  }

  var targetData = getTargetData();

  getTargetLangs().then(function (languages) {

    languages.forEach(function (_ref2) {
      var lg = _ref2.lg,
          langId = _ref2.langId;


      getFilesFromQordoba(langId).then(function (files) {
        var namespaces = (0, _keys2.default)(files);

        namespaces.forEach(function (ns) {
          var _files$ns = files[ns],
              fileId = _files$ns.fileId,
              updated = _files$ns.updated;

          var fsUpdated = targetData[lg] ? targetData[lg][ns] : '';

          if (fsUpdated !== updated && !isLocked(lg, ns)) {
            logger('downloading lg: ' + lg + ' and ns: ' + ns);
            downloadFile(lg, langId, ns, fileId, updated);
          }
        });
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
  consumerKey = options.consumerKey;
  qordobaPath = options.loadPath.split('/').slice(0, -2).join('/');
  i18nPath = options.i18nPath;
  sourceLanguage = options.sourceLanguage;
  syncInterval = options.syncInterval;
  milestoneId = options.milestoneId;
  debug = options.debug;
  i18n = i18next;

  // need better error handling for config options
  if (typeof organizationId !== 'number') throw Error('Not a valid organizationId. Must be a number');
  if (typeof projectId !== 'number') throw Error('Not a valid projectId. Must be a number');
  if (typeof milestoneId !== 'number') throw Error('Not a valid milestoneId. Must be a number');
  if (typeof consumerKey !== 'string') throw Error('Not a valid consumerKey. Must be a string');

  // initialize file structure
  initialize().then(function () {
    syncSourceFiles();
    // handle interval
    var _syncInterval = syncInterval,
        interval = _syncInterval.interval,
        seconds = _syncInterval.seconds;

    if (interval === true) {
      setInterval(syncTargetFiles, seconds * 1000);
      logger('Interval set to ' + seconds + ' seconds');
    }
    // syncTargetFiles
    syncTargetFiles();
  }).catch(function (err) {
    return logger('failed at initQordoba', err);
  });
}

// export private methods for testing
function _funcs(options) {
  // init options for test
  organizationId = options.organizationId;
  projectId = options.projectId;
  consumerKey = options.consumerKey;
  qordobaPath = options.loadPath.split('/').slice(0, -2).join('/');
  i18nPath = options.i18nPath;
  sourceLanguage = options.sourceLanguage;
  syncInterval = options.syncInterval;
  milestoneId = options.milestoneId;
  debug = options.debug;

  return {
    incrementQueue: incrementQueue,
    decrementQueue: decrementQueue,
    checkQueuesForItems: checkQueuesForItems,
    makeDirectory: makeDirectory,
    readDirectory: readDirectory,
    writeFile: writeFile,
    pipeFile: pipeFile,
    delay: delay,
    watchSourceFiles: watchSourceFiles,
    initialize: initialize,
    getSourceData: getSourceData,
    writeSourceData: writeSourceData,
    updateSourceData: updateSourceData,
    getTargetData: getTargetData,
    writeTargetData: writeTargetData,
    updateTimestamp: updateTimestamp,
    getFileId: getFileId,
    getTimestamp: getTimestamp,
    uploadFile: uploadFile,
    updateFile: updateFile,
    addToUploadQueue: addToUploadQueue,
    addToUpdateQueue: addToUpdateQueue,
    syncSourceFiles: syncSourceFiles,
    getTargetLangs: getTargetLangs,
    getTargetFiles: getTargetFiles,
    getJsonFromQordoba: getJsonFromQordoba,
    lockFile: lockFile,
    unlockFile: unlockFile,
    isLocked: isLocked,
    reloadResources: reloadResources,
    downloadFile: downloadFile,
    getFilesFromQordoba: getFilesFromQordoba,
    syncTargetFiles: syncTargetFiles
  };
}

// exports.syncSourceFiles = syncSourceFiles;
// exports.syncTargetFiles = syncTargetFiles;