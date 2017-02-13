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

let i18n, projectId, organizationId, xAuthToken, consumerKey, qordobaPath, i18nPath, milestoneId, syncInterval, sourceLanguage;
const FILE_TYPE = 'JSON';
const FILE_VERSION = '4.22';
const MILESTONE = 'Translating';
const DOWNLOAD_BUFFER = 10000;
let sourceFiles;
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
  const files = fs.readdirSync(sourceFiles);
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
  console.log(`Delaying ${t} milliseconds to prevent server error`)
  return new Promise((resolve) => { 
    setTimeout(resolve, t)
  });
}

const watchSourceFiles = (sourcepath, target) => {
  console.log('Watching source files directory:', sourcepath)
  var watcher = chokidar.watch(sourcepath, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  

  watcher.on('change', (path, stats) => {
    console.log('Source files changed. Uploading to qordoba')
    syncSourceFiles();

    console.log('mgerging changes into qordoba directory');
    console.log(path, target, process.cwd())
    // merge changes into qordoba folder
    mergedirs(sourcepath, target, 'overwrite');
  });
}

const initialize = (qordobaPath, i18nPath) => {
  // make sure qordoba files dir exists
  makeDirectory(qordobaPath);

  // make sure qordoba files dir exists
  makeDirectory(`${qordobaPath}/files`);

  // make sure source metadata store exists
  writeFile(`${qordobaPath}/files/source.json`, {}, false);

  // make sure source language dir exists in a qordoba locales
  sourceFiles = `${i18nPath}/${sourceLanguage}`;
  const sourceTarget = `${qordobaPath}/${sourceLanguage}`;

  if (makeDirectory(sourceTarget)) {
    // copy source langage files into qordoba folder
    const files = fs.readdirSync(sourceFiles);
    return Promise.all( files.map( (file, i) => {
      const path = `${sourceFiles}/${file}`;
      const newPath = `${sourceTarget}/${file}`;
      return pipeFile(path, newPath);
    }));
  }

  // start watcher for source files
  watchSourceFiles(sourceFiles, sourceTarget)

  // set milestoneId globally
  console.log('calling get milestoneId')
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
  const data = getSourceData(qordobaPath);
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
const writeTargetData = (data, qordobaPath) => {
  const path = `${qordobaPath}/files/target.json`;
  writeFile(path, data, true)
}

// update target file timestamp
const updateTimestamp = (lg, ns, newTimestamp) => {
  console.log('updating timestamp', lg, ns, newTimestamp);
  const data = getTargetData(qordobaPath);
  if (data[lg] === undefined) { data[lg] = {}; };
  data[lg][ns] = newTimestamp;
  writeTargetData(data, qordobaPath);
}


/*
===================================
UPLOAD / UPDATE SOUCE FILES
===================================
*/

// gets file id from filename
const getFileId = (file, qordobaPath) => {
  const data = getSourceData(qordobaPath);
  return data[file]['fileId'];
}

// gets timestamp of file
const getTimestamp = (file, sourceFiles) => {
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
    .then( body => JSON.parse(body).files_ids[0] )
    .catch( err => console.log(err) )
}

// handles file update
const updateFile = (fileId, filePath) => {
  var options = { 
    method: 'POST',
    url: `https://api.qordoba.com/v2/files/update`,
    headers: { fileId, projectId, consumerKey, 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: { 
      file: fsp.createReadStream(filePath)
    }
  }

  return rp(options)
  .then( body => JSON.parse(body).files_ids[0] )
  .catch( err => console.log(err) )
}

// adds file to upload promise queue
const addToUploadQueue = (file) => {
  const path = `${sourceFiles}/${file}`;

  incrementQueue('upload')
  uploadQueue = uploadQueue.then(() => {
    return delay(7000)
      .then(() => uploadFile(path, FILE_TYPE, FILE_VERSION))
      .then( fileId => {
        console.log(`Successfully uploaded ${file}`);
        updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
        setTimeout(() => decrementQueue('upload'), DOWNLOAD_BUFFER);
      })
      .catch( ({ body }) => console.log(body) );
  })
}

// adds file to update promise queue
const addToUpdateQueue = (file) => {
  const id = getFileId(file, qordobaPath);
  const path = `${sourceFiles}/${file}`;

  incrementQueue('update');
  updateQueue = updateQueue.then(() => {
    return delay(7000)
      .then(() => updateFile(id, path))
      .then( (fileId) => {
        console.log(`Successfully updated ${file}`);
        updateSourceData(file, fileId, path, qordobaPath, sourceFiles);
        setTimeout(() => decrementQueue('update'), DOWNLOAD_BUFFER);
      })
      .catch( ({ body }) => console.log(body) );
  })
}

// checks for new uploads / updates, sends files to queue
const syncSourceFiles = () => {
  const data = getSourceData(qordobaPath);
  const files = readDirectory(sourceFiles)

  files.forEach((file) => {
    const timestamp = getTimestamp(file, sourceFiles);
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
    return JSON.parse(body).targetLanguages.map(tl => {
      return {
        lg: tl.targetCode.slice(0, 2),
        langId: tl.targetId
      }
    })
  })
  .catch( ({ body }) => console.log(body) )
}

// get namespaces and fileIds
const getTargetFiles = () => {
  const data = getSourceData(qordobaPath);
  const files = Object.keys(data);
  return files.map(file => {
    return {
      ns: file,
      fileId: data[file]['fileId']
    }
  })
}

// get id of specified milestone (new one)
const getMilestoneId = () => {
  console.log('calling getMilestoneId')
  const options = {
    url: `https://api.qordoba.com/v2/projects/workflow`,
    headers: { consumerKey, projectId },
  }

  return rp(options)
  .then(body => {
    const milestones = JSON.parse(body).milestones
    // set to global to limit API calls
    milestoneId = milestones.filter(ms => ms.milestoneName === MILESTONE)[0].milestoneId;
    console.log('milestones', milestones);
    console.log('milestoneId', milestoneId)
    return milestoneId;
  })
  .catch(err => console.log(err))
}

// get JSON data from Qordoba (new one)
const getJsonFromQordoba = (languageId, fileId) => {
  console.log('milestoneId', milestoneId);

  const url = `https://api.qordoba.com/v2/files/json`;
  const options = {
    method: 'GET',
    url: url,
    headers: { consumerKey, projectId, languageId, fileId, milestoneId }
  }

  return rp(options)
    .then(body => {
      console.log('type of body', typeof body);
      return JSON.parse(body);
    })
    .catch( (err) => console.log(err) );
}

// lock files already being downloaded
const lockFile = (lg, ns) => currentDownloads[`${lg}|${ns}`] = true;
const unlockFile = (lg, ns) => currentDownloads[`${lg}|${ns}`] = false;
const isLocked = (lg, ns) => currentDownloads[`${lg}|${ns}`] ? true : false;

// reload resources after downlaod
const reloadResources = (lg, ns) => {
  const namespace = ns.split('.')[0];
  i18n.services.backendConnector.read(lg, namespace, 'read', null, null, (err, data) => {
    if (err) i18n.services.backendConnector.logger.warn(`loading namespace ${ns} for language ${lg} failed`, err);
    if (!err && data) i18n.services.backendConnector.logger.log(`loaded namespace ${ns} for language ${lg}`, data);

    console.log(`Reloading resources for ${lg}|${namespace}`);
    i18n.services.backendConnector.loaded(`${lg}|${namespace}`, err, data);
  });
}

// handle download process
const downloadFile = (lg, langId, ns, fileId, newTimestamp) => {
  if (milestoneId === undefined) {
    console.log('no milestone id');
    return;
  }
  const path = `${qordobaPath}/${lg}/${ns}`;
  
  lockFile(lg, ns);
  return getJsonFromQordoba(langId, fileId)
    .then((data) => {
      makeDirectory(`${qordobaPath}/${lg}`)
      writeFile(path, data, true);
      updateTimestamp(lg, ns, newTimestamp);
      reloadResources(lg, ns);
      unlockFile(lg, ns);
      console.log(`Downloaded namespace: ${ns} for language: ${lg}`)
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
      return body.reduce((obj, { fileName, fileId, updated}) => {
        if (obj[fileName] === undefined) { obj[fileName] = { updated, fileId }; }
        
        if (updated > obj[fileName]['updated']) {
          obj[fileName] = { updated, fileId };
        }
        
        return obj
      }, {})
    })
  .catch( ({ body }) => console.log(body) );
}

// sync target files (new one)
const syncTargetFiles = () => {
  console.log('sync target files')
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
            console.log('downloading lg:', lg, 'ns:', ns);
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
  xAuthToken = options.xAuthToken;
  consumerKey = options.consumerKey; 
  qordobaPath = options.loadPath.split('/').slice(0, -2).join('/');
  i18nPath = options.i18nPath;
  sourceLanguage = options.sourceLanguage;
  syncInterval = options.syncInterval;
  i18n = i18next;

  // initialize file structure
  initialize(qordobaPath, i18nPath)
  .then(() => {
    getMilestoneId().then(msId => milestoneId = msId);
  })
  .then(() => {
    syncSourceFiles()
    // handle interval
    const { interval, seconds } = syncInterval;
    if (interval === true) {
      setInterval( syncTargetFiles, seconds * 1000 )
      console.log('Interval set to', seconds, 'seconds')
    }
    // syncTargetFiles
    syncTargetFiles();
  })
  .catch( err => console.log(err) )
}

// export private methods for testing
export function _funcs() {
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