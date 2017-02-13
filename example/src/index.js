import React from 'react';
import ReactDOM from 'react-dom';

// components
import App from './components/app';
import Jumbo  from './components/jumbo';
import Keys from './components/keys';

// import i18next dependencies
import i18n from 'i18next';
import { I18nextProvider } from 'react-i18next';

import XHR from 'i18next-xhr-backend';


// react-router
import { Router, Route, browserHistory, IndexRoute } from 'react-router';

// import Plugin
// import Plugin from './plugin/i18n-qordoba-plugin';

// initialize i18next
window.i18n = i18n
	.use(XHR)
  .init({
  	backend: {
      // path where resources get loaded from, or a function
      // returning a path:
      // function(lngs, namespaces) { return customPath; }
      // the returned path will interpolate lng, ns if provided like giving a static path
      loadPath: '/locales/resources.json?lng={{lng}}&ns={{ns}}',

      // path to post missing resources
      addPath: 'locales/add/{{lng}}/{{ns}}',

      // your backend server supports multiloading
      // /locales/resources.json?lng=de+en&ns=ns1+ns2
      allowMultiLoading: true,
    },
    lngs: ['en', 'es', 'da'],
    fallbackLng: 'en',
    preload: ['en'],
    // have a common namespace used around the full app
    ns: ['common', 'jumbo'],
    defaultNS: 'common',

    debug: true,

    interpolation: {
      escapeValue: false // not needed for react!!
    },
    returnObjects: true,
    // resources : resBundle
  })

// overwrite existing with new bundle
// window.i18n.addResourceBundle('en', 'jumbo', qordobaResBundle.en.jumbo, true, true);

ReactDOM.render(
  <I18nextProvider i18n={ i18n }>
  	<Router history={browserHistory}>
  		<Route path='/' component={App}>
  			<IndexRoute component={Jumbo} />
  			<Route path='keys' component={Keys} />
  		</Route>
  	</Router>
  </I18nextProvider>,
  document.getElementById('container')
);


export { i18n }
