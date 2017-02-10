'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

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
    pathToQordobaLocales = void 0,
    pathToSourceLanguage = void 0,
    milestoneId = void 0,
    syncTargetLanguageFiles = void 0;
var FILE_TYPE = 'JSON';
var FILE_VERSION = '4.22';
var MILESTONE = 'Translating';
var DOWNLOAD_BUFFER = 10000;
var sourceLanguageDir = void 0;
/*
===================================
INITIALIZE
===================================
*/
var testLog = function testLog() {
  console.log('SWEET!!!');
  console.log("Env( test ): %s", process.env.tests);
  console.log(process.env.tests === 'running');
};

var initialize = function initialize(pathToQordobaLocales, pathToSourceLanguage) {
  // make sure qordoba files dir exists
  if (!_fs2.default.existsSync(pathToQordobaLocales)) {
    _fs2.default.mkdirSync(pathToQordobaLocales);
  }

  // make sure qordoba files dir exists
  var filesDir = pathToQordobaLocales + '/files';
  if (!_fs2.default.existsSync(filesDir)) {
    _fs2.default.mkdirSync(filesDir);
  }

  // make sure store exists
  var fileData = pathToQordobaLocales + '/files/fileData.json';
  if (!_fs2.default.existsSync(fileData)) {
    _fs2.default.writeFileSync(fileData, (0, _stringify2.default)({}));
  }

  // make sure source language dir exists in a qordoba locales
  var sourceLang = pathToSourceLanguage.split('/').slice(-1)[0];
  sourceLanguageDir = pathToQordobaLocales + '/' + sourceLang;
  var targetDir = pathToQordobaLocales + '/' + sourceLang;

  if (!_fs2.default.existsSync(targetDir)) {
    var _ret = function () {
      _fs2.default.mkdirSync(targetDir);
      // copy source langage files into qordoba folder
      var files = _fs2.default.readdirSync(pathToSourceLanguage);
      var oldPaths = files.map(function (f) {
        return pathToSourceLanguage + '/' + f;
      });
      var newPaths = files.map(function (f) {
        return pathToQordobaLocales + '/' + sourceLang + '/' + f;
      });

      return {
        v: _promise2.default.all(files.map(function (f, i) {
          return _fsPromise2.default.createReadStream(oldPaths[i]).pipe(_fsPromise2.default.createWriteStream(newPaths[i]));
        }))
      };
    }();

    if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
  }

  // start watcher for source files
  console.log('Watching source files directory:', sourceLanguageDir);
  watchSourceFiles(sourceLanguageDir);

  return _promise2.default.resolve();
};

var delay = function delay(t) {
  console.log('Delaying ' + t + ' milliseconds to prevent server error');
  return new _promise2.default(function (resolve) {
    setTimeout(resolve, t);
  });
};

var watchSourceFiles = function watchSourceFiles(path) {
  var watcher = _chokidar2.default.watch(path, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  watcher.on('change', function (path, stats) {
    console.log('Source files changed. Uploading to qordoba');
    console.log('NEED TO ALSO COPY CHANGES OVER TO i18n source dir');
    syncSourceFiles();
    if (stats) console.log('File ' + path + ' changed size to ' + stats.size);
  });
};

// queues to attach promises
var updateQueue = _promise2.default.resolve();
var updateQueueLength = 0;

var uploadQueue = _promise2.default.resolve();
var uploadQueueLength = 0;

// download cache (for error handling)
var currentDownloads = {};

/*
===================================
UPLOAD / UPDATE SOURCE FILES
===================================
*/

//////////////////////////
///// UPLOAD METHODS /////
/////////////////////////

// gets files from english locales
var getFiles = function getFiles(sourceLanguageDir) {
  return _fsPromise2.default.readdir(sourceLanguageDir);
};

// gets file metadata from fs
var getFileData = function getFileData(pathToQordobaLocales) {
  var path = pathToQordobaLocales + '/files/fileData.json';
  return JSON.parse(_fs2.default.readFileSync(path, 'utf8'));
};

// write file metadata to fs
var writeFileData = function writeFileData(data, pathToQordobaLocales) {
  var path = pathToQordobaLocales + '/files/fileData.json';
  return _fs2.default.writeFileSync(path, (0, _stringify2.default)(data, null, 2));
};

// gets file id from filename
var getFileId = function getFileId(file, pathToQordobaLocales) {
  var data = getFileData(pathToQordobaLocales);
  return data[file]['fileId'];
};

// gets timestamp of file
var getTimestamp = function getTimestamp(file, sourceLanguageDir) {
  var path = sourceLanguageDir + '/' + file;
  var stats = _fs2.default.statSync(path);
  return stats.mtime.valueOf();
};

// adds file metadata after successful file upload
var addFileData = function addFileData(file, fileId, filepath, pathToQordobaLocales, sourceLanguageDir) {
  var data = getFileData(pathToQordobaLocales);
  var lastModified = getTimestamp(file, sourceLanguageDir);
  data[file] = { fileId: fileId, lastModified: lastModified, filepath: filepath };
  return writeFileData(data, pathToQordobaLocales);
};

// handles upload process
var uploadAndPost = function uploadAndPost(filepath, type, versionTag) {
  var options = {
    method: 'POST',
    url: 'https://devapi.qordoba.com/v2/files/upload',
    qs: { type: type },
    headers: {
      versionTag: '' + versionTag,
      projectid: '' + projectId,
      organizationid: '' + organizationId,
      consumerkey: '' + consumerKey,
      'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
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

// adds file to upload promise queue
var addToUploadQueue = function addToUploadQueue(file) {
  console.log('Adding', file, 'to upload queue');
  uploadQueueLength += 1;
  var path = sourceLanguageDir + '/' + file;
  uploadQueue = uploadQueue.then(function () {
    return delay(7000).then(function () {
      return uploadAndPost(path, FILE_TYPE, FILE_VERSION);
    }).then(function (fileId) {
      console.log('Successfully uploaded ' + file);
      addFileData(file, fileId, path, pathToQordobaLocales, sourceLanguageDir);
      setTimeout(function () {
        return uploadQueueLength -= 1;
      }, DOWNLOAD_BUFFER);
    }).catch(function (err) {
      return console.log(err);
    });
  });
};

//////////////////////////
///// UPDATE METHODS /////
/////////////////////////

// handles first part of update process
var updateFile = function updateFile(fileId, filePath) {
  var options = {
    method: 'POST',
    url: 'https://app.qordoba.com/api/projects/' + projectId + '/files/' + fileId + '/update/upload',
    headers: {
      'x-auth-token': '2c116052-e424-421f-aa72-b50e9291fe10',
      'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: {
      file: _fsPromise2.default.createReadStream(filePath)
    }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    var _JSON$parse = JSON.parse(body),
        id = _JSON$parse.id;

    return id;
  }).catch(function (err) {
    return console.log(err);
  });
};

// handles second part of update process
var postFile = function postFile(fileId, newFileId) {
  var payload = {
    'new_file_id': '' + newFileId,
    'keep_in_project': false
  };

  var options = {
    method: 'PUT',
    url: 'https://app.qordoba.com/api/projects/' + projectId + '/files/' + fileId + '/update/apply',
    headers: {
      'content-type': 'application/json',
      'x-auth-token': '2c116052-e424-421f-aa72-b50e9291fe10' },
    body: payload,
    json: true
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return body;
  }).catch(function (err) {
    return console.log(err);
  });
};

// handles update process
var updateAndPostFile = function updateAndPostFile(fileId, filePath) {
  return updateFile(fileId, filePath).then(function (newFileId) {
    return postFile(fileId, newFileId).catch(function (err) {
      return console.log(err);
    });
  });
};

// adds file to update promise queue
var addToUpdateQueue = function addToUpdateQueue(file) {
  console.log('Adding', file, 'to update queue');
  updateQueueLength += 1;
  var id = getFileId(file, pathToQordobaLocales);
  var path = sourceLanguageDir + '/' + file;
  updateQueue = updateQueue.then(function () {
    return delay(7000).then(function () {
      return updateAndPostFile(id, path);
    }).then(function (success) {
      console.log('Successfully updated ' + file);
      var fileId = success.files_ids[0];
      addFileData(file, fileId, path, pathToQordobaLocales, sourceLanguageDir);
      setTimeout(function () {
        return updateQueueLength -= 1;
      }, DOWNLOAD_BUFFER);
    }).catch(function (err) {
      return console.log(err);
    });
  });
};

// this function checks for new uploads / updates
// queues for update / upload
var syncSourceFiles = function syncSourceFiles() {
  var data = getFileData(pathToQordobaLocales);

  return getFiles(sourceLanguageDir).then(function (files) {
    var promise = _promise2.default.resolve();

    files.forEach(function (file) {
      var timestamp = getTimestamp(file, sourceLanguageDir);
      var currentFile = data[file];

      if (currentFile === undefined) {
        addToUploadQueue(file);
      } else if (Number(currentFile.lastModified) !== Number(timestamp)) {
        addToUpdateQueue(file);
      }
    });
    return promise;
  });
};

/*
===========================================
DOWNLOAD LANGUAGE FILES
===========================================
*/

// write json file to directory
var writeFile = function writeFile(path, data) {
  return _fs2.default.writeFileSync(path, (0, _stringify2.default)(data, null, 2));
};

// write target language directories
var writeDirectory = function writeDirectory(lang, pathToQordobaLocales) {
  var filesDir = pathToQordobaLocales + '/' + lang;
  if (!_fs2.default.existsSync(filesDir)) {
    _fs2.default.mkdirSync(filesDir);
  }
};

// get target language ids and codes
var getTargetLangs = function getTargetLangs() {
  var getLanguageURL = 'https://api.qordoba.com/v2/projects/detail';
  var options = {
    method: 'GET',
    url: getLanguageURL,
    headers: { consumerKey: consumerKey, projectId: projectId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return JSON.parse(body).targetLanguages.map(function (tl) {
      return {
        lg: tl.targetCode.slice(0, 2),
        langId: tl.targetId
      };
    });
  }).catch(function (_ref) {
    var body = _ref.body;
    return console.log(body);
  });
};

// get namespaces and fileIds
var getNamespaces = function getNamespaces() {
  var data = getFileData(pathToQordobaLocales);
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
    var id = JSON.parse(body).milestones.filter(function (milestone) {
      return milestone.milestoneName === MILESTONE;
    })[0].milestoneId;
    // set to global
    milestoneId = id;
    console.log('milestoneId', milestoneId);
    return id;
  }).catch(function (err) {
    return console.log(err);
  });
};

// get target language metadata
var getTargetData = function getTargetData(pathToQordobaLocales) {
  var targetData = pathToQordobaLocales + '/files/targetData.json';
  if (!_fs2.default.existsSync(targetData)) {
    _fs2.default.writeFileSync(targetData, (0, _stringify2.default)({}));
  }

  return JSON.parse(_fs2.default.readFileSync(targetData, 'utf8'));
};

// write target language metadata
var writeTargetData = function writeTargetData(data, pathToQordobaLocales) {
  var path = pathToQordobaLocales + '/files/targetData.json';
  return _fs2.default.writeFileSync(path, (0, _stringify2.default)(data, null, 2));
};

// get fileids and timestamp from qordoba by languageId (old one)
// const getQordobaTimestamps = (languageId) => {
//   const getProjectFilesURL = `https://app.qordoba.com/api/projects/${projectId}/languages/${languageId}/page_settings/search`;
//   const options = {
//     method: 'POST',
//     url: getProjectFilesURL,
//     headers: { consumerKey, 'x-auth-token': xAuthToken },
//     body: {},
//     json: true
//   }
//   return rp(options)
//     .then(body => {
//       const obj = {};
//       body.pages.forEach(({ page_id, update }) => {
//         obj[page_id] = update;
//       })
//       return obj;
//     })
//   .catch(err => console.log(err))
// }

// get fileids and timestamp from qordoba by languageId (new One)
var getQordobaTimestamps = function getQordobaTimestamps(languageId) {
  // const getProjectFilesURL = `https://app.qordoba.com/api/projects/${projectId}/languages/${languageId}/page_settings/search`;
  // const options = {
  //   method: 'POST',
  //   url: getProjectFilesURL,
  //   headers: { consumerKey, 'x-auth-token': xAuthToken },
  //   body: {},
  //   json: true
  // }

  var options = {
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/list',
    headers: { consumerKey: consumerKey, languageId: languageId, projectId: projectId, 'content-type': 'application/json' },
    body: {},
    json: true
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    var obj = {};
    body.forEach(function (_ref2) {
      var fileId = _ref2.fileId,
          updated = _ref2.updated;
      return obj[fileId] = updated;
    });
    return obj;
  }).catch(function (err) {
    return console.log(err);
  });
};

// get all Qordoba timestamps
var getAllQordobaTimestamps = function getAllQordobaTimestamps(languages, files) {
  var timestamps = [];
  languages.forEach(function (_ref3) {
    var lg = _ref3.lg,
        langId = _ref3.langId;
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

// helper function to set nested values on object from array
var assign = function assign(obj, keys, val) {
  var lastKey = keys.pop();
  var lastObj = keys.reduce(function (obj, key) {
    return obj[key] = obj[key] || {};
  }, obj);
  lastObj[lastKey] = val;
};

// build Json object from response
var buildJsonObject = function buildJsonObject(body) {
  return body.segments.map(function (segment) {
    return {
      keys: segment.reference.split('/').filter(function (s) {
        return s !== '';
      }),
      value: segment.translation.replace(/<com-qordoba-variable-escape>/g, '').replace(/<\/com-qordoba-variable-escape>/g, '')
    };
  }).reduce(function (o, s) {
    assign(o, s.keys, s.value);
    return o;
  }, {});
};

// get JSON data from Qordoba
var getJsonFromQordoba = function getJsonFromQordoba(languageId, fileId, milestoneId) {
  var url = 'https://api.qordoba.com/v2/files/value_by_key';
  var options = {
    method: 'GET',
    url: url,
    headers: { consumerKey: consumerKey, projectId: projectId, languageId: languageId, fileId: fileId, milestoneId: milestoneId }
  };

  return (0, _requestPromise2.default)(options).then(function (body) {
    return buildJsonObject(JSON.parse(body));
  }).catch(function (err) {
    return console.log(err);
  });
};

// write new timestamp value to target language metadata
var writeNewTimestamp = function writeNewTimestamp(lg, ns, newTimestamp, pathToQordobaLocales) {
  var data = getTargetData(pathToQordobaLocales);
  if (data[lg] === undefined) {
    data[lg] = {};
  };
  data[lg][ns] = newTimestamp;
  writeTargetData(data, pathToQordobaLocales);
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
var processDownload = function processDownload(lg, langId, ns, fileId, newTimestamp, milestoneId, pathToQordobaLocales) {
  var path = pathToQordobaLocales + '/' + lg + '/' + ns;
  // set to true in currentDownloads
  currentDownloads['' + (lg | ns)] = true;
  return getJsonFromQordoba(langId, fileId, milestoneId).then(function (data) {
    writeFile(path, data);
    writeNewTimestamp(lg, ns, newTimestamp, pathToQordobaLocales);
    console.log('Finished download for namespace: ' + ns + ' for language: ' + lg);
    // reload resources for i18n instance after downlaod
    reloadResources(lg, ns);
    // remove from currentDownloads
    currentDownloads['' + (lg | ns)] = false;
  });
};

// sync all target language files
var syncTargetFiles = function syncTargetFiles() {
  if (uploadQueueLength > 0 || updateQueueLength > 0) {
    console.log('Need to wait ' + DOWNLOAD_BUFFER / 1000 + ' seconds after most recent upload to download files');
    return;
  }

  console.log('Syncing target language files');
  var files = getNamespaces();
  var data = getTargetData(pathToQordobaLocales);
  var languages = void 0;

  // getMilestoneId sets a global variable, so we only make the call once
  _promise2.default.all([getTargetLangs(), milestoneId || getMilestoneId()]).then(function (result) {
    languages = result[0];
    return getAllQordobaTimestamps(languages, files);
  }).then(function (qTimestamps) {
    languages.forEach(function (_ref4) {
      var lg = _ref4.lg,
          langId = _ref4.langId;

      if (data[lg] === undefined) {
        data[lg] = {};
      };

      writeDirectory(lg, pathToQordobaLocales);
      files.forEach(function (_ref5) {
        var ns = _ref5.ns,
            fileId = _ref5.fileId;

        if (data[lg][ns] === undefined) {
          data[lg][ns] = null;
        };

        var qTimestamp = qTimestamps[langId][fileId];
        var fsTimestamp = data[lg][ns];

        // check timestamps and make sure file isn't currently being downloaded
        if (fsTimestamp !== qTimestamp && !currentDownloads[lg + '|' + ns]) {
          console.log('Downloading namespace: ' + ns + ' for language: ' + lg + ' with fileID: ' + fileId);
          processDownload(lg, langId, ns, fileId, qTimestamp, milestoneId, pathToQordobaLocales);
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
  pathToQordobaLocales = options.loadPath.split('/').slice(0, -2).join('/');
  pathToSourceLanguage = options.pathToSourceLanguage;
  syncTargetLanguageFiles = options.syncTargetLanguageFiles;
  i18n = i18next;

  // initialize file structure
  initialize(pathToQordobaLocales, pathToSourceLanguage).then(function () {
    // syncSourceFiles
    return syncSourceFiles();
  }).then(function () {

    // handle interval
    var _syncTargetLanguageFi = syncTargetLanguageFiles,
        interval = _syncTargetLanguageFi.interval,
        seconds = _syncTargetLanguageFi.seconds;

    if (interval === true) {
      console.log('Setting interval of', seconds, 'seconds');
      setInterval(syncTargetFiles, seconds * 1000);
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
    testLog: testLog,
    initialize: initialize,
    delay: delay,
    watchSourceFiles: watchSourceFiles,
    getFiles: getFiles,
    getFileData: getFileData,
    writeFileData: writeFileData,
    getFileId: getFileId,
    getTimestamp: getTimestamp,
    addFileData: addFileData,
    uploadAndPost: uploadAndPost,
    addToUploadQueue: addToUploadQueue,
    syncSourceFiles: syncSourceFiles,
    writeFile: writeFile,
    writeDirectory: writeDirectory,
    getTargetLangs: getTargetLangs,
    getNamespaces: getNamespaces,
    getMilestoneId: getMilestoneId,
    getTargetData: getTargetData,
    writeTargetData: writeTargetData,
    getQordobaTimestamps: getQordobaTimestamps,
    getAllQordobaTimestamps: getAllQordobaTimestamps,
    assign: assign,
    buildJsonObject: buildJsonObject,
    getJsonFromQordoba: getJsonFromQordoba,
    writeNewTimestamp: writeNewTimestamp,
    reloadResources: reloadResources,
    processDownload: processDownload,
    syncTargetFiles: syncTargetFiles
  };
}

// exports.syncSourceFiles = syncSourceFiles;
// exports.syncTargetFiles = syncTargetFiles;