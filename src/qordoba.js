import fs from 'fs';
import rp from 'request-promise';
import fsp from 'fs-promise';
import chokidar from 'chokidar';
import mergedirs from 'merge-dirs';
/*
===================================
GLOBAL VARIABLES
===================================
*/

let i18n, projectId, organizationId, sourceFiles, consumerKey, qordobaPath, i18nPath, milestoneId, syncInterval, sourceLanguage, debug;
// need to test not JSON filetypes
const FILE_TYPE = 'JSON';
const FILE_VERSION = '4.22';
const DOWNLOAD_BUFFER = 10000;

const logger = (message, data = '') => {
  if (debug !== true) { return; }
  console.log('\n')
  console.log(`logger :: ${message}`);
  if (data !== '') console.log(`data :: ${JSON.stringify(data, null, 2)}`);
}

/*
===================================
INITIALIZE
===================================
*/

// queues to attach promises
let updateQueue = Promise.resolve();
let updateQueueLength = 0;

let uploadQueue = Promise.resolve();
let uploadQueueLength = 0;

// download cache (for error handling)
const currentDownloads = {};

const incrementQueue = (q) => q === 'update' ? updateQueueLength += 1 : uploadQueueLength += 1;
const decrementQueue = (q) => q === 'update' ? updateQueueLength -= 1 : uploadQueueLength -= 1;
const checkQueuesForItems = (q) => uploadQueueLength > 0 || updateQueueLength > 0 ? true : false;

/*
===================================
FILE HELPERS
===================================
*/

const makeDirectory = (path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
    return true;
  }
  return false;
}

const readDirectory = (path) => {
  const files = fs.readdirSync(path);
  return files;
}

const writeFile = (path, data, overwrite) => {
  if (overwrite || !fs.existsSync(path)) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  }
}

const pipeFile = (path, newPath) => {
  return fsp.createReadStream( path )
            .pipe( fsp.createWriteStream( newPath ) );
}

const delay = (t) => {
  logger(`Delaying ${t} milliseconds to prevent server error`)
  return new Promise((resolve) => { 
    setTimeout(resolve, t)
  });
}

const watchSourceFiles = (sourcepath, target) => {
  logger(`Watching source files directory: ${sourcepath}`)
  var watcher = chokidar.watch(sourcepath, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  watcher.on('change', (path, stats) => {
    // upload source files to qordoba
    syncSourceFiles();
    // merge changes into qordoba folder
    mergedirs(sourcepath, target, 'overwrite');
  });
}

const initialize = () => {
  // make sure qordoba files dir exists
  makeDirectory(qordobaPath);

  // make sure qordoba files dir exists
  makeDirectory(`${qordobaPath}/files`);

  // make sure source metadata store exists
  writeFile(`${qordobaPath}/files/source.json`, {}, false);

  // make sure source language dir exists in a qordoba locales
  sourceFiles = `${i18nPath}/${sourceLanguage}`;
  const sourceTarget = `${qordobaPath}/${sourceLanguage}`;

  // start watcher for source files
  watchSourceFiles(sourceFiles, sourceTarget)

  // check if source language dir exists in qordoba folder
  if (makeDirectory(sourceTarget)) {
    // if not, copy over source langage files
    const files = fs.readdirSync(sourceFiles);
    return Promise.all( files.map( (file, i) => {
      const path = `${sourceFiles}/${file}`;
      const newPath = `${sourceTarget}/${file}`;
      return pipeFile(path, newPath);
    }))
  }
 
  return Promise.resolve();
}

/*
===================================
SOURCE / TARGET DATA HELPERS
===================================
*/

// gets file metadata from fs
const getSourceData = () => {
  const path = `${qordobaPath}/files/source.json`;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// write file metadata to fs
const writeSourceData = (data) => {
  const path = `${qordobaPath}/files/source.json`;
  return writeFile(path, data, true)
}

// adds file metadata after successful file upload
const updateSourceData = (file, fileId, filepath) => {
  const data = getSourceData();
  const lastModified = getTimestamp(file, sourceFiles);
  data[file] = { fileId, lastModified, filepath }
  return writeSourceData(data, qordobaPath);
}

// get target language metadata
const getTargetData = () => {
  const targetData = `${qordobaPath}/files/target.json`
  if (!fs.existsSync(targetData)) {
    fs.writeFileSync(targetData, JSON.stringify({}));
  }

  return JSON.parse(fs.readFileSync(targetData, 'utf8'));
}

// write target language metadata
const writeTargetData = (data) => {
  const path = `${qordobaPath}/files/target.json`;
  writeFile(path, data, true)
}

// update target file timestamp
const updateTimestamp = (lg, ns, newTimestamp) => {
  logger(`updating timestamp for lg: ${lg} and ns: ${ns} with timestamp: ${newTimestamp}`);
  const data = getTargetData(qordobaPath);
  if (data[lg] === undefined) { data[lg] = {}; };
  data[lg][ns] = newTimestamp;
  writeTargetData(data);
}


/*
===================================
UPLOAD / UPDATE SOUCE FILES
===================================
*/

// gets file id from filename
const getFileId = (file) => {
  const data = getSourceData();
  return data[file]['fileId'];
}

// gets timestamp of file
const getTimestamp = (file) => {
  const path = `${sourceFiles}/${file}`;
  const stats = fs.statSync(path)
  return stats.mtime.valueOf();
}

// handles file upload
const uploadFile = (filepath, type, versionTag) => {
  var options = { 
    method: 'POST',
    url: 'https://devapi.qordoba.com/v2/files/upload',
    qs: { type },
    headers: { versionTag, projectId, organizationId, consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: { 
      file: fsp.createReadStream(filepath),
      file_names: '[]'
    }
  };

  return rp(options)
    .then( body => {
      const data = JSON.parse(body);

      if (data.files_ids[0]) logger(`uploaded file from filepath ${filepath}`, data);
      if (!data.files_ids[0]) logger(`failed to retrieve fileId for upload from ${filepath}`, data);
      
      return data.files_ids[0]
    })
    .catch( err => logger(`uploading file from filepath ${filepath} failed`, err) )
}

// handles file update
const updateFile = (fileId, filepath) => {
  var options = { 
    method: 'POST',
    url: `https://api.qordoba.com/v2/files/update`,
    headers: { fileId, projectId, consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: { 
      file: fsp.createReadStream(filepath)
    }
  }

  return rp(options)
  .then( body => {
    if (body.files_ids[0]) logger(`updated file from filepath ${filepath} with fileId ${fileId}`, body);
    if (!body.files_ids[0]) logger(`failed to retrieve fileId for update from ${filepath} with fileId ${fileId}`, body);
    
    return JSON.parse(body).files_ids[0]
  })
  .catch( err => logger(`updating file from filepath ${filepath} failed`, err) )
}

// adds file to upload promise queue
const addToUploadQueue = (file) => {
  const path = `${sourceFiles}/${file}`;

  incrementQueue('upload')
  uploadQueue = uploadQueue.then(() => {
    return delay(7000)
      .then(() => uploadFile(path, FILE_TYPE, FILE_VERSION))
      .then( fileId => {
        logger(`Successfully uploaded ${file}`);
        updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
        setTimeout(() => decrementQueue('upload'), DOWNLOAD_BUFFER);
      })
      .catch( err => logger(`add to upload queue failed`, err) )
  })
}

// adds file to update promise queue
const addToUpdateQueue = (file) => {
  const id = getFileId(file);
  const path = `${sourceFiles}/${file}`;

  incrementQueue('update');
  updateQueue = updateQueue.then(() => {
    return delay(7000)
      .then(() => updateFile(id, path))
      .then( (fileId) => {
        logger(`Successfully updated ${file}`);
        updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
        setTimeout(() => decrementQueue('update'), DOWNLOAD_BUFFER);
      })
      .catch( err => logger(`add to update queue failed`, err) )
  })
}

// checks for new uploads / updates, sends files to queue
const syncSourceFiles = () => {
  const data = getSourceData();
  const files = readDirectory(sourceFiles)

  files.forEach((file) => {
    const timestamp = getTimestamp(file);
    const currentFile = data[file];
    
    if (currentFile === undefined) {
      addToUploadQueue(file)
    } else if (Number(currentFile.lastModified) !== Number(timestamp)) {
      addToUpdateQueue(file);
    }
  });
}

/*
===========================================
DOWNLOAD TARGET FILES
===========================================
*/

// get target language ids and codes
const getTargetLangs = () => {
  const options = {
    method: 'GET',
    url: 'https://api.qordoba.com/v2/projects/detail',
    headers: { consumerKey, projectId },
  };

  return rp(options)
  .then( (body) => {
    const data = JSON.parse(body);

    if (data.targetLanguages) logger(`fetched target languages for projectId: ${projectId}`, data);
    if (!data.targetLanguages) logger(`failed to retrieve target languages for projectId: ${projectId}`, data);
    
    return data.targetLanguages.map(tl => {
      return {
        lg: tl.targetCode.slice(0, 2),
        langId: tl.targetId
      }
    })
  })
  .catch( err => logger(`fetching target languages failed`, err) )
}

// get namespaces and fileIds
const getTargetFiles = () => {
  const data = getSourceData();
  const files = Object.keys(data);
  return files.map(file => {
    return {
      ns: file,
      fileId: data[file]['fileId']
    }
  })
}

// get JSON data from Qordoba (new one)
const getJsonFromQordoba = (languageId, fileId) => {
  const url = `https://api.qordoba.com/v2/files/json`;
  const options = {
    method: 'GET',
    url: url,
    headers: { consumerKey, projectId, languageId, fileId, milestoneId }
  }

  return rp(options)
    .then(body => {
      const data = JSON.parse(body);
      if (data) logger(`fetched json for fileId ${fileId} and languageId ${languageId}`, data);
      return data;
    })
    .catch( (err) => logger( `fetching json for fileId ${fileId} and languageId ${languageId} failed`, err) );
}

// lock files already being downloaded
const lockFile = (lg, ns) => currentDownloads[`${lg}|${ns}`] = true;
const unlockFile = (lg, ns) => currentDownloads[`${lg}|${ns}`] = false;
const isLocked = (lg, ns) => currentDownloads[`${lg}|${ns}`] ? true : false;

// reload resources after downlaod
const reloadResources = (lg, ns) => {
  const namespace = ns.split('.')[0];
  i18n.services.backendConnector.read(lg, namespace, 'read', null, null, (err, data) => {
    if (err) logger(`loading namespace ${ns} for language ${lg} failed`, err);
    if (!err && data) logger(`loaded namespace ${ns} for language ${lg}`, data);

    logger(`Reloading resources for ${lg}|${namespace}`);
    i18n.services.backendConnector.loaded(`${lg}|${namespace}`, err, data);
  });
}

// handle download process
const downloadFile = (lg, langId, ns, fileId, newTimestamp) => {
  const path = `${qordobaPath}/${lg}/${ns}`;
  
  lockFile(lg, ns);
  return getJsonFromQordoba(langId, fileId)
    .then((data) => {
      makeDirectory(`${qordobaPath}/${lg}`)
      writeFile(path, data, true);
      updateTimestamp(lg, ns, newTimestamp);
      reloadResources(lg, ns);
      unlockFile(lg, ns);
      logger(`Downloaded namespace: ${ns} for language: ${lg}`)
    })
}

// get most recent file copies from qordoba
const getFilesFromQordoba = (languageId) => {
  var options = { 
    method: 'POST',
    url: 'https://api.qordoba.com/v2/files/list',
    headers: 
     { consumerKey, languageId, projectId, 'content-type': 'application/json' },
    body: {},
    json: true 
  };

  return rp(options)
    .then(body => {
      
      const files = body.reduce((obj, { fileName, fileId, updated}) => {
        if (obj[fileName] === undefined) { obj[fileName] = { updated, fileId }; }
        
        if (updated > obj[fileName]['updated']) {
          obj[fileName] = { updated, fileId };
        }
        
        return obj
      }, {})

      if (files) logger(`fetched files from qordoba for languageId: ${languageId}`, files);
      if (!files) logger(`failed to retrieve files for languageId: ${languageId}`, files);

      return files;
    })
  .catch( err => logger(`fetching files from qordoba failed`, err) )
}

// sync target files (new one)
const syncTargetFiles = () => {
  logger('synching target files')
  if (checkQueuesForItems()) { return; }

  const targetData = getTargetData();

  getTargetLangs()
  .then((languages) => {

    languages.forEach(({ lg, langId }) => {

      getFilesFromQordoba(langId)
      .then((files) => {
        const namespaces = Object.keys(files);

        namespaces.forEach((ns) => {
          const { fileId, updated } = files[ns];
          const fsUpdated = targetData[lg] ? targetData[lg][ns] : '';

          if (fsUpdated !== updated && !isLocked(lg, ns)) {
            logger(`downloading lg: ${lg} and ns: ${ns}`);
            downloadFile(lg, langId, ns, fileId, updated)
          }
        })
      })
    })
  })
}

/*
===========================================
INITIALIZE QORDOBA OBJECT AND VARS
===========================================
*/

export function initQordoba(options, i18next) {
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
  initialize()
  .then(() => {
    syncSourceFiles()
    // handle interval
    const { interval, seconds } = syncInterval;
    if (interval === true) {
      setInterval( syncTargetFiles, seconds * 1000 )
      logger(`Interval set to ${seconds} seconds`)
    }
    // syncTargetFiles
    syncTargetFiles();
  })
  .catch( err => logger(`failed at initQordoba`, err) )
}

// export private methods for testing
export function _funcs(options) {
  // init options for test
  organizationId = options.organizationId;
  projectId = options.projectId;
  xAuthToken = options.xAuthToken;
  consumerKey = options.consumerKey; 
  qordobaPath = options.loadPath.split('/').slice(0, -2).join('/');
  i18nPath = options.i18nPath;
  sourceLanguage = options.sourceLanguage;
  syncInterval = options.syncInterval;
  milestoneId = options.milestoneId;
  debug = options.debug;

  return {
    initialize,
    delay,
    watchSourceFiles,
    getSourceData,
    writeFileData,
    getFileId,
    getTimestamp,
    updateSourceData,
    uploadFile,
    addToUploadQueue,
    syncSourceFiles,
    writeFile,
    getTargetLangs,
    getNamespaces,
    getMilestoneId,
    getTargetData,
    writeTargetData,
    getAllQordobaTimestamps,
    getJsonFromQordoba,
    updateTimestamp,
    reloadResources,
    processDownload,
    syncTargetFiles
  }
}


// exports.syncSourceFiles = syncSourceFiles;
// exports.syncTargetFiles = syncTargetFiles;