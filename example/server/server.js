const express = require('express');
const app = express();
const i18next = require('i18next');
const middleware = require('i18next-express-middleware');
const path = require('path');
const port = 3000;
const qordobabackend = require('../../lib/index').default;

i18next
// .use(middleware.LanguageDetector)
.use(qordobabackend)
.init({
  backend: {
    // path to qordoba folder where resources will get loaded from
    loadPath: './locales/qordoba/{{lng}}/{{ns}}.json',

    // path to post missing resources
    addPath: './locales/qordoba/{{lng}}/{{ns}}.missing.json',

    // jsonIndent to use when storing json files
    jsonIndent: 2,

    // qordoba organization id
    organizationId: 3036,

    // qordoba project id
    projectId: 3711,

    // xAuthToken => to be removed when API stabilizes
    xAuthToken: '2c116052-e424-421f-aa72-b50e9291fe10',

    // qordoba customer key
    consumerKey: 'ooGM5l9ojTag4osd7V72SPaxmjtyH8Ww',

    // path to project source language in i18next locales folder
    pathToSourceLanguage: './locales/i18next/en',

    // provide an optional interval to sync target language files
    syncTargetLanguageFiles: { interval: true, seconds: 10 }
  }
});

app.use(middleware.handle(i18next));

// serve static assets
app.use(express.static(path.resolve(__dirname, '../', 'build')));

// multiload backend route
app.get('/locales/resources.json', middleware.getResourcesHandler(i18next));

// direct all other traffic to index.html
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../', 'build', 'index.html'));
});

app.listen(port, () => console.log('Server listening on port', port) );