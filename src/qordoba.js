import fs from 'fs';
import rp from 'request-promise';
import fsp from 'fs-promise';
import chokidar from 'chokidar';
/*
===================================
GLOBAL VARIABLES
===================================
*/

let i18n, projectId, organizationId, xAuthToken, consumerKey, pathToQordobaLocales, pathToSourceLanguage, milestoneId, syncTargetLanguageFiles;
const FILE_TYPE = 'JSON';
const FILE_VERSION = '4.22';
const MILESTONE = 'Translating';
const DOWNLOAD_BUFFER = 10000;
let sourceLanguageDir;
/*
===================================
INITIALIZE
===================================
*/
const testLog = () => {
  console.log('SWEET!!!')
  console.log( "Env( test ): %s", process.env.tests )
  console.log(process.env.tests === 'running')
}

const initialize = (pathToQordobaLocales, pathToSourceLanguage) => {
  // make sure qordoba files dir exists
  if (!fs.existsSync(pathToQordobaLocales)) {
    fs.mkdirSync(pathToQordobaLocales);
  }

  // make sure qordoba files dir exists
  const filesDir = `${pathToQordobaLocales}/files`
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir);
  }

  // make sure store exists
  const fileData = `${pathToQordobaLocales}/files/fileData.json`
  if (!fs.existsSync(fileData)) {
    fs.writeFileSync(fileData, JSON.stringify({}));
  }


  // make sure source language dir exists in a qordoba locales
  const sourceLang = pathToSourceLanguage.split('/').slice(-1)[0];
  sourceLanguageDir = `${pathToQordobaLocales}/${sourceLang}`;
  const targetDir = `${pathToQordobaLocales}/${sourceLang}`;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir);
    // copy source langage files into qordoba folder
    const files = fs.readdirSync(pathToSourceLanguage);
    const oldPaths = files.map(f => `${pathToSourceLanguage}/${f}`);
    const newPaths = files.map(f => `${pathToQordobaLocales}/${sourceLang}/${f}`);

    return Promise.all( files.map( (f, i) => {
      return fsp.createReadStream( oldPaths[i] ).pipe( fsp.createWriteStream( newPaths[i] ) );
    }));
  }

  // start watcher for source files
  console.log('Watching source files directory:', sourceLanguageDir)
  watchSourceFiles(sourceLanguageDir)

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
    syncSourceFiles();
    if (stats) console.log(`File ${path} changed size to ${stats.size}`);
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
const getFiles = (sourceLanguageDir) => {
  return fsp.readdir(sourceLanguageDir)
}

// gets file metadata from fs
const getFileData = (pathToQordobaLocales) => {
  const path = `${pathToQordobaLocales}/files/fileData.json`;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// write file metadata to fs
const writeFileData = (data, pathToQordobaLocales) => {
  const path = `${pathToQordobaLocales}/files/fileData.json`;
  return fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

// gets file id from filename
const getFileId = (file, pathToQordobaLocales) => {
  const data = getFileData(pathToQordobaLocales);
  return data[file]['fileId'];
}

// gets timestamp of file
const getTimestamp = (file, sourceLanguageDir) => {
  const path = `${sourceLanguageDir}/${file}`;
  const stats = fs.statSync(path)
  return stats.mtime.valueOf();
}

// adds file metadata after successful file upload
const addFileData = (file, fileId, filepath, pathToQordobaLocales, sourceLanguageDir) => {
  const data = getFileData(pathToQordobaLocales);
  const lastModified = getTimestamp(file, sourceLanguageDir);
  data[file] = { fileId, lastModified, filepath }
  return writeFileData(data, pathToQordobaLocales);
}

// handles upload process
const uploadAndPost = (filepath, type, versionTag) => {
  var options = { 
    method: 'POST',
    url: 'https://devapi.qordoba.com/v2/files/upload',
    qs: { type },
    headers: { 
      versionTag: `${versionTag}`,
      projectid: `${projectId}`,
      organizationid: `${organizationId}`,
      consumerkey: `${consumerKey}`,
      'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
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
  uploadQueueLength += 1;
  const path = `${sourceLanguageDir}/${file}`;
  uploadQueue = uploadQueue.then(() => {
    return delay(7000)
      .then(() => uploadAndPost(path, FILE_TYPE, FILE_VERSION))
      .then( fileId => {
        console.log(`Successfully uploaded ${file}`);
        addFileData(file, fileId, path, pathToQordobaLocales, sourceLanguageDir);
        setTimeout(() => uploadQueueLength -= 1, DOWNLOAD_BUFFER);
      })
      .catch( err => console.log(err) )
  })
}

//////////////////////////
///// UPDATE METHODS /////
/////////////////////////

// handles first part of update process
const updateFile = (fileId, filePath) => {
  var options = { 
    method: 'POST',
    url: `https://app.qordoba.com/api/projects/${projectId}/files/${fileId}/update/upload`,
    headers: { 
       'x-auth-token': '2c116052-e424-421f-aa72-b50e9291fe10',
       'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
    formData: { 
      file: fsp.createReadStream(filePath)
    }
  }

  return rp(options)
  .then((body) => {
    const { id } = JSON.parse(body);
    return id;
  })
  .catch(err => console.log(err))
}

// handles second part of update process
const postFile = (fileId, newFileId) => {
  const payload = {
    'new_file_id': `${newFileId}`,
    'keep_in_project': false 
  };

  var options = { 
    method: 'PUT',
    url: `https://app.qordoba.com/api/projects/${projectId}/files/${fileId}/update/apply`,
    headers: { 
       'content-type': 'application/json',
       'x-auth-token': '2c116052-e424-421f-aa72-b50e9291fe10' },
    body: payload,
    json: true 
  };

  return rp(options)
  .then( body => body )
  .catch( err => console.log(err) )
}

// handles update process
const updateAndPostFile = (fileId, filePath) => {
  return updateFile(fileId, filePath)
      .then((newFileId) => {
    return postFile(fileId, newFileId)
      .catch( err => console.log(err) )
  })
}

// adds file to update promise queue
const addToUpdateQueue = (file) => {
  console.log('Adding', file, 'to update queue')
  updateQueueLength += 1;
  const id = getFileId(file, pathToQordobaLocales);
  const path = `${sourceLanguageDir}/${file}`;
  updateQueue = updateQueue.then(() => {
    return delay(7000)
      .then(() => updateAndPostFile(id, path))
      .then( (success) => {
        console.log(`Successfully updated ${file}`);
        const fileId = success.files_ids[0];
        addFileData(file, fileId, path, pathToQordobaLocales, sourceLanguageDir);
        setTimeout(() => updateQueueLength -= 1, DOWNLOAD_BUFFER);
      })
      .catch( err => console.log(err) );
  })
}

// this function checks for new uploads / updates
// queues for update / upload
const syncSourceFiles = () => {
  const data = getFileData(pathToQordobaLocales);

  return getFiles(sourceLanguageDir).then((files) => {
    const promise = Promise.resolve();

    files.forEach((file) => {
      const timestamp = getTimestamp(file, sourceLanguageDir);
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
const writeDirectory = (lang, pathToQordobaLocales) => {
  const filesDir = `${pathToQordobaLocales}/${lang}`
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir);
  }
}

// get target language ids and codes
const getTargetLangs = () => {
  const getLanguageURL = `https://devapi.qordoba.com/v2/projects/${projectId}`;
  const options = {
    method: 'GET',
    projectId: projectId,
    url: getLanguageURL,
    headers: { consumerKey },
  };

  return rp(options)
  .then( (body) => {
    const targetLanguages = JSON.parse(body).project.target_languages;
    return targetLanguages.map(({ id, code }) => {
      const lg = code.slice(0, 2);
      const langId = id;
      return { lg, langId }
    });
  })
  .catch( ({ body }) => console.log(body) )
}

// get namespaces and fileIds
const getNamespaces = () => {
  const data = getFileData(pathToQordobaLocales);
  const files = Object.keys(data);
  return files.map(file => {
    return {
      ns: file,
      fileId: data[file]['fileId']
    }
  })
}

// get id of specified milestone
const getMilestoneId = () => {
  const options = {
    url: `https://app.qordoba.com/api/projects/${projectId}/workflow`,
    headers: { 'x-auth-token': xAuthToken, consumerKey },
  }
  return rp(options)
  .then(body => {
  const { workflow } = JSON.parse(body);
  const result = workflow.milestones
    .filter(milestone => milestone.milestone.name === MILESTONE)
    .map(milestone => milestone.milestone.id)[0]
  return result;
  })
  .then(res => milestoneId = res)
  .catch(err => console.log(err))
}

// get target language metadata
const getTargetData = (pathToQordobaLocales) => {
  const targetData = `${pathToQordobaLocales}/files/targetData.json`
  if (!fs.existsSync(targetData)) {
    fs.writeFileSync(targetData, JSON.stringify({}));
  }

  return JSON.parse(fs.readFileSync(targetData, 'utf8'));
}

// write target language metadata
const writeTargetData = (data, pathToQordobaLocales) => {
  const path = `${pathToQordobaLocales}/files/targetData.json`;
  return fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

// get fileids and timestamp from qordoba by languageId
const getQordobaTimestamps = (languageId) => {
  const getProjectFilesURL = `https://app.qordoba.com/api/projects/${projectId}/languages/${languageId}/page_settings/search`;
  const options = {
    method: 'POST',
    url: getProjectFilesURL,
    headers: { consumerKey, 'x-auth-token': xAuthToken },
    body: {},
    json: true
  }
  return rp(options)
    .then(body => {
      const obj = {};
      body.pages.forEach(({ page_id, update }) => {
        obj[page_id] = update;
      })
      return obj;
    })
  .catch(err => console.log(err))
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

// helper function to set nested values on object from array
const assign = (obj, keys, val) => { 
    const lastKey = keys.pop();
    const lastObj = keys.reduce((obj, key) => 
    obj[key] = obj[key] || {}, obj); 
    lastObj[lastKey] = val;
};

// build Json object from response
const buildJsonObject = (body) => {
  return body.segments.map((segment) => {
    return {
      keys: segment.reference.split('/').filter(s => s !== ''),
      value: segment.translation
              .replace(/<com-qordoba-variable-escape>/g, '')
              .replace(/<\/com-qordoba-variable-escape>/g, '')
    }
  }).reduce((o, s) => {
    assign(o, s.keys, s.value);
    return o;
  }, {})
}

// get JSON data from Qordoba
const getJsonFromQordoba = (languageId, fileId, milestoneId) => {
  const url = `https://api.qordoba.com/v2/files/value_by_key`;
  const options = {
    method: 'GET',
    url: url,
    headers: { consumerKey, projectId, languageId, fileId, milestoneId }
  }

  return rp(options)
    .then(body => buildJsonObject(JSON.parse(body)))
    .catch(err => console.log(err))
}

// write new timestamp value to target language metadata
const writeNewTimestamp = (lg, ns, newTimestamp, pathToQordobaLocales) => {
  const data = getTargetData(pathToQordobaLocales);
  if (data[lg] === undefined) { data[lg] = {}; };
  data[lg][ns] = newTimestamp;
  writeTargetData(data, pathToQordobaLocales);
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
const processDownload = (lg, langId, ns, fileId, newTimestamp, milestoneId, pathToQordobaLocales) => {
  const path = `${pathToQordobaLocales}/${lg}/${ns}`;
  // set to true in currentDownloads
  currentDownloads[`${lg|ns}`] = true;
  return getJsonFromQordoba(langId, fileId, milestoneId)
    .then((data) => {
      writeFile(path, data);
      writeNewTimestamp(lg, ns, newTimestamp, pathToQordobaLocales);
      console.log(`Finished download for namespace: ${ns} for language: ${lg}`)
      // reload resources for i18n instance after downlaod
      reloadResources(lg, ns);
      // remove from currentDownloads
      currentDownloads[`${lg|ns}`] = false;
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
  const data = getTargetData(pathToQordobaLocales);
  let languages, milestoneId;

  Promise.all([getTargetLangs(), getMilestoneId()])
  .then( (result) => {
    languages = result[0];
    milestoneId = result[1];
    return getAllQordobaTimestamps(languages, files);
  })
  .then( (qTimestamps) => {
    languages.forEach( ({ lg, langId }) => {
      if ( data[lg] === undefined ) { data[lg] = {}; };

      writeDirectory(lg, pathToQordobaLocales);
      files.forEach( ({ ns, fileId }) => {
        if ( data[lg][ns] === undefined ) { data[lg][ns] = null };

        const qTimestamp = qTimestamps[langId][fileId];
        const fsTimestamp = data[lg][ns];

        // check timestamps and make sure file isn't currently being downloaded
        if (fsTimestamp !== qTimestamp && !currentDownloads[`${lg}|${ns}`]) {
          console.log(`Downloading namespace: ${ns} for language: ${lg} with fileID: ${fileId}`)
          processDownload( lg, langId, ns, fileId, qTimestamp, milestoneId, pathToQordobaLocales )
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
  pathToQordobaLocales = options.loadPath.split('/').slice(0, -2).join('/');
  pathToSourceLanguage = options.pathToSourceLanguage;
  syncTargetLanguageFiles = options.syncTargetLanguageFiles;
  i18n = i18next;

  // initialize file structure
  initialize(pathToQordobaLocales, pathToSourceLanguage)
  .then(() => {
    // syncSourceFiles
    return syncSourceFiles()
  })
  .then(() => {

    // handle interval
    const { interval, seconds } = syncTargetLanguageFiles;
    if (interval === true) {
      console.log('Setting interval of', seconds, 'seconds')
      setInterval( syncTargetFiles, seconds * 1000 )
    }

    // syncTargetFiles
    syncTargetFiles();
  })
  .catch( err => console.log(err) )
}

export function _funcs() {
  return {
    testLog,
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