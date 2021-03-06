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
    organizationId: 'ORGANIZATION_ID',

    // qordoba project id
    projectId: 'PROJECT_ID',

    // id of workflow milestone to pull translations from
    milestoneId: 'MILESTONE_ID',

    // qordoba customer key
    consumerKey: 'CONSUMER_KEY',

    // path to project source language in i18next locales folder
    i18nPath: './locales/i18next',

    // source language for project
    sourceLanguage: 'en',

    // provide an optional interval to sync target language files
    syncInterval: { interval: true, seconds: 10 },

    // add debuger
    debug: true
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