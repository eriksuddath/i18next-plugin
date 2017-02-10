import fs from 'fs';
import rp from 'request-promise';
import fsp from 'fs-promise';
import chokidar from 'chokidar';
/*
===================================
GLOBAL VARIABLES
===================================
*/

let i18n, projectId, organizationId, xAuthToken, consumerKey, qordobaPath, i18nPath, milestoneId, syncInterval;
const FILE_TYPE = 'JSON';
const FILE_VERSION = '4.22';
const MILESTONE = 'Translating';
const DOWNLOAD_BUFFER = 10000;
let sourceLangDir;
/*
===================================
INITIALIZE
===================================
*/

const initialize = (qordobaPath, i18nPath) => {
  // make sure qordoba files dir exists
  if (!fs.existsSync(qordobaPath)) {
    fs.mkdirSync(qordobaPath);
  }

  // make sure qordoba files dir exists
  const filesDir = `${qordobaPath}/files`
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir);
  }

  // make sure store exists
  const fileData = `${qordobaPath}/files/fileData.json`
  if (!fs.existsSync(fileData)) {
    fs.writeFileSync(fileData, JSON.stringify({}));
  }

  // make sure source language dir exists in a qordoba locales
  const sourceLang = i18nPath.split('/').slice(-1)[0];
  sourceLangDir = `${qordobaPath}/${sourceLang}`;
  const targetDir = `${qordobaPath}/${sourceLang}`;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir);
    // copy source langage files into qordoba folder
    const files = fs.readdirSync(i18nPath);
    const oldPaths = files.map(f => `${i18nPath}/${f}`);
    const newPaths = files.map(f => `${qordobaPath}/${sourceLang}/${f}`);

    return Promise.all( files.map( (f, i) => {
      return fsp.createReadStream( oldPaths[i] ).pipe( fsp.createWriteStream( newPaths[i] ) );
    }));
  }

  // start watcher for source files
  console.log('Watching source files directory:', sourceLangDir)
  watchSourceFiles(sourceLangDir)

  return Promise.resolve();
}

const delay = (t) => {
  console.log(`Delaying ${t} milliseconds to prevent server error`)
  return new Promise((resolve) => { 
    setTimeout(resolve, t)
  });
}

const watchSourceFiles = (path) => {
  var watcher = chokidar.watch(path, {
    ignored: /[\/\\]\./,
    persistent: true
  });

  watcher.on('change', (path, stats) => {
    console.log('Source files changed. Uploading to qordoba')
    console.log('NEED TO ALSO COPY CHANGES OVER TO i18n source dir')
    syncSourceFiles();
  });
}

// queues to attach promises
let updateQueue = Promise.resolve();
let updateQueueLength = 0;

let uploadQueue = Promise.resolve();
let uploadQueueLength = 0;

// download cache (for error handling)
const currentDownloads = {};

/*
===================================
UPLOAD / UPDATE SOURCE FILES
===================================
*/

//////////////////////////
///// UPLOAD METHODS /////
/////////////////////////

// gets files from english locales
const getFiles = (sourceLangDir) => {
  return fsp.readdir(sourceLangDir);
}

// gets file metadata from fs
const getFileData = (qordobaPath) => {
  const path = `${qordobaPath}/files/fileData.json`;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// write file metadata to fs
const writeFileData = (data, qordobaPath) => {
  const path = `${qordobaPath}/files/fileData.json`;
  return fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

// gets file id from filename
const getFileId = (file, qordobaPath) => {
  const data = getFileData(qordobaPath);
  return data[file]['fileId'];
}

// gets timestamp of file
const getTimestamp = (file, sourceLangDir) => {
  const path = `${sourceLangDir}/${file}`;
  const stats = fs.statSync(path)
  return stats.mtime.valueOf();
}

// adds file metadata after successful file upload
const addFileData = (file, fileId, filepath, qordobaPath, sourceLangDir) => {
  const data = getFileData(qordobaPath);
  const lastModified = getTimestamp(file, sourceLangDir);
  data[file] = { fileId, lastModified, filepath }
  return writeFileData(data, qordobaPath);
}

// handles upload process
const uploadAndPost = (filepath, type, versionTag) => {
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

// adds file to upload promise queue
const addToUploadQueue = (file) => {
  console.log('Adding', file, 'to upload queue');
  const path = `${sourceLangDir}/${file}`;

  uploadQueueLength += 1;

  uploadQueue = uploadQueue.then(() => {
    return delay(7000)
      .then(() => uploadAndPost(path, FILE_TYPE, FILE_VERSION))
      .then( fileId => {
        console.log(`Successfully uploaded ${file}`);
        addFileData(file, fileId, path, qordobaPath, sourceLangDir);
        setTimeout(() => uploadQueueLength -= 1, DOWNLOAD_BUFFER);
      })
      .catch( ({ body }) => console.log(body) );
  })
}

//////////////////////////
///// UPDATE METHODS /////
/////////////////////////

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

// adds file to update promise queue
const addToUpdateQueue = (file) => {
  console.log('Adding', file, 'to update queue')
  const id = getFileId(file, qordobaPath);
  const path = `${sourceLangDir}/${file}`;

  updateQueueLength += 1;

  updateQueue = updateQueue.then(() => {
    return delay(7000)
      .then(() => updateFile(id, path))
      .then( (fileId) => {
        console.log(`Successfully updated ${file}`);
        addFileData(file, fileId, path, qordobaPath, sourceLangDir);
        setTimeout(() => updateQueueLength -= 1, DOWNLOAD_BUFFER);
      })
      .catch( ({ body }) => console.log(body) );
  })
}

// this function checks for new uploads / updates
// queues for update / upload
const syncSourceFiles = () => {
  const data = getFileData(qordobaPath);

  return getFiles(sourceLangDir).then((files) => {
    const promise = Promise.resolve();

    files.forEach((file) => {
      const timestamp = getTimestamp(file, sourceLangDir);
      const currentFile = data[file];
      
      if (currentFile === undefined) {
        addToUploadQueue(file)
      } else if (Number(currentFile.lastModified) !== Number(timestamp)) {
        addToUpdateQueue(file);
      }
    });
    return promise;
  });
}

/*
===========================================
DOWNLOAD LANGUAGE FILES
===========================================
*/

// write json file to directory
const writeFile = (path, data) => {
  return fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

// write target language directories
const writeDirectory = (lang, qordobaPath) => {
  const filesDir = `${qordobaPath}/${lang}`
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir);
  }
}

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
const getNamespaces = () => {
  const data = getFileData(qordobaPath);
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
  const options = {
    url: `https://api.qordoba.com/v2/projects/workflow`,
    headers: { consumerKey, projectId },
  }

  return rp(options)
  .then(body => {
    const milestones = JSON.parse(body).milestones
    // set to global to limit API calls
    milestoneId = milestones.filter(ms => ms.milestoneName === MILESTONE)[0].milestoneId;
    return milestoneId;
  })
  .catch(err => console.log(err))
}

// get target language metadata
const getTargetData = (qordobaPath) => {
  const targetData = `${qordobaPath}/files/targetData.json`
  if (!fs.existsSync(targetData)) {
    fs.writeFileSync(targetData, JSON.stringify({}));
  }

  return JSON.parse(fs.readFileSync(targetData, 'utf8'));
}

// write target language metadata
const writeTargetData = (data, qordobaPath) => {
  const path = `${qordobaPath}/files/targetData.json`;
  return fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

// get fileids and timestamp from qordoba by languageId (new One)
const getQordobaTimestamps = (languageId) => {
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
      const obj = {};
      body.forEach( ({ fileId, updated }) => obj[fileId] = updated )
      return obj;
    })
  .catch( ({ body }) => console.log(body) );
}

// get all Qordoba timestamps
const getAllQordobaTimestamps = (languages, files) => {
  const timestamps = [];
  languages.forEach( ({ lg, langId }) => timestamps.push( getQordobaTimestamps(langId) ))
  return Promise.all(timestamps).then((timestamps) => {
    const obj = {};
    timestamps.forEach((timestamp, idx) => {
      const langId = languages[idx]['langId'];
      obj[langId] = timestamp;
    })
    return obj;
  })
}

// get JSON data from Qordoba (new one)
const getJsonFromQordoba = (languageId, fileId, milestoneId) => {
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
    .catch( ({ body }) => console.log(body) );
}

// write new timestamp value to target language metadata
const writeNewTimestamp = (lg, ns, newTimestamp, qordobaPath) => {
  const data = getTargetData(qordobaPath);
  if (data[lg] === undefined) { data[lg] = {}; };
  data[lg][ns] = newTimestamp;
  writeTargetData(data, qordobaPath);
}

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
const processDownload = (lg, langId, ns, fileId, newTimestamp, milestoneId, qordobaPath) => {
  const path = `${qordobaPath}/${lg}/${ns}`;
  // set to true in currentDownloads
  currentDownloads[`${lg|ns}`] = true;
  return getJsonFromQordoba(langId, fileId, milestoneId)
    .then((data) => {
      writeFile(path, data);
      writeNewTimestamp(lg, ns, newTimestamp, qordobaPath);
      // reload resources for i18n instance after downlaod
      reloadResources(lg, ns);
      // remove from currentDownloads
      currentDownloads[`${lg|ns}`] = false;

      console.log(`Finished download for namespace: ${ns} for language: ${lg}`)
    })
}

// sync all target language files
const syncTargetFiles = () => {
  if (uploadQueueLength > 0 || updateQueueLength > 0) { 
     console.log(`Need to wait ${DOWNLOAD_BUFFER / 1000} seconds after most recent upload to download files`);
     return;
  }

  console.log('Syncing target language files');
  const files = getNamespaces();
  const data = getTargetData(qordobaPath);
  let languages;

  // getMilestoneId sets a global variable, so we only make the call once
  Promise.all([getTargetLangs(), milestoneId || getMilestoneId()])
  .then( (result) => {
    languages = result[0];
    return getAllQordobaTimestamps(languages, files);
  })
  .then( (qTimestamps) => {
    languages.forEach( ({ lg, langId }) => {
      if ( data[lg] === undefined ) { data[lg] = {}; };

      writeDirectory(lg, qordobaPath);
      files.forEach( ({ ns, fileId }) => {
        if ( data[lg][ns] === undefined ) { data[lg][ns] = null };

        const qTimestamp = qTimestamps[langId][fileId];
        const fsTimestamp = data[lg][ns];

        // check timestamps and make sure file isn't currently being downloaded
        if (fsTimestamp !== qTimestamp && !currentDownloads[`${lg}|${ns}`]) {
          console.log(`Downloading namespace: ${ns} for language: ${lg} with fileID: ${fileId}`)
          processDownload( lg, langId, ns, fileId, qTimestamp, milestoneId, qordobaPath )
        }
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
  syncInterval = options.syncInterval;
  i18n = i18next;

  // initialize file structure
  initialize(qordobaPath, i18nPath)
  .then(() => {
    // syncSourceFiles
    return syncSourceFiles()
  })
  .then(() => {

    // handle interval
    const { interval, seconds } = syncInterval;
    if (interval === true) {
      console.log('Setting interval of', seconds, 'seconds')
      setInterval( syncTargetFiles, seconds * 1000 )
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
    getFiles,
    getFileData,
    writeFileData,
    getFileId,
    getTimestamp,
    addFileData,
    uploadAndPost,
    addToUploadQueue,
    syncSourceFiles,
    writeFile,
    writeDirectory,
    getTargetLangs,
    getNamespaces,
    getMilestoneId,
    getTargetData,
    writeTargetData,
    getQordobaTimestamps,
    getAllQordobaTimestamps,
    assign,
    buildJsonObject,
    getJsonFromQordoba,
    writeNewTimestamp,
    reloadResources,
    processDownload,
    syncTargetFiles
  }
}


// exports.syncSourceFiles = syncSourceFiles;
// exports.syncTargetFiles = syncTargetFiles;