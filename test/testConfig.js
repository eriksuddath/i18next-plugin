module.exports = {
  // path to qordoba folder where resources will get loaded from
  loadPath: './test/locales/qordoba/{{lng}}/{{ns}}.json',

  // path to post missing resources
  addPath: './test/locales/qordoba/{{lng}}/{{ns}}.missing.json',

  // jsonIndent to use when storing json files
  jsonIndent: 2,

  // qordoba organization id
  organizationId: 3036,

  // qordoba project id
  projectId: 3789,

  // id of workflow milestone to pull translations from
  milestoneId: 1111,

  // qordoba customer key
  consumerKey: 'ooGM5l9ojTag4osd7V72SPaxmjtyH8Ww',

  // path to project source language in i18next locales folder
  i18nPath: './test/locales/i18next',

  // source language for project
  sourceLanguage: 'en',

  // provide an optional interval to sync target language files
  syncInterval: { interval: true, seconds: 10 }
}