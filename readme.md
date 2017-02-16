# Project Title

i18next-qordoba-plugin makes it easy to sync locales files between any i18next project and qordoba- qordoba.com.

## Getting Started

To get started, clone down the repo from github and npm install in the root directory to downlaod dependencies for the plugin. If you want to run the example app, also cd into '/example' and run 'npm install'.

Before getting started, you will need to visit Qordoba.com, set up an account, and create a new project. If you are running the example app, set english as you source language and pick a few target languages. Select JSON (NOT JSON(custom)!!!) as your file type, set up translation memories, etc. Once the app is created, you will get a consumerKey, organizationId, and projectId.

SCREENSHOTS / MORE INFO ON GETTING CONFIG KEYS

After you have setup your project and have your configuration keys you are ready to run the example app.

Qordoba-i18next-plugin file structure
-- root
   -- example // example react app
   -- lib // transplied ES6 code
   -- src 
      -- index.js // i18next-node-fs-backend (see below)
      -- qordoba.js // main functionality, handles sync between qordoba and filesystem
      -- utils.js // helper functions for i18next-node-fs-backend
   -- test // self explanatory (see above scripts)
   -- gulpfile.js // handles 'gulp build' command
   package.json, etc

Example App File Structure
-- example
   -- build  // compiled ES5 code
   -- locales
      -- i18next
         -- en
	   -- namespace1.json // namespaces for i18next, this is where keys are linked to translated strings
	   -- namespace2.json
      -- qordoba // built by plugin
         -- es, da, etc  // all your target languages
	 -- files
	    -- source.json // metadata for source files, timestamps, fileIds, etc
	    -- target.json // metadata for target files, timestamps
   -- public
   -- server
   	-- server.js // express server for example app
   -- src
   -- style
   package.json
   webpack.config.js


To run the example app, go into the server and add you keys.
	- 'ORGANIZATION_ID' // id of your qordoba organization
	- 'PROJECT_ID' // id qordoba give you when you create a new project
	- 'MILESTONE_ID' // id of milestone (eg. 'Proofreading' ) that you want to pull translations from
	- 'CONSUMER_KEY" // secret key to access API
	
Then 'npm run build' to transplile your configuration into build directory.

If you just created a new project, check for the qoroba folder in 'root/example/locales', delete this folder if it exists. The plugin handles synching your source keys / strings from 'i18next/{{source language}}'. It will take all your source files, copy them over to the qordoba directory, then upload these files to qordoba and download and build folders and namespaces for all target languages.

### Scripts

Root Directory
	- 'gulp build' - transpliles ES6 code from src -> lib into ES5. Provides runtime support for promises.
	- 'npm test' - run mocha tests for plugin.
Example app
	- 'npm run build' - transpiles ES6 code from src -> build. Builds production bundle for app.
	- 'npm start' - starts express server in server/server.js. Serves example app to localhost:3000

### Prerequisites

Familiarity with the i18next internationalization framework.

http://i18next.com/

I18next-node-fs-backend. This is what handles loading the locales files into the i18next framework. 

https://github.com/i18next/i18next-node-fs-backend

### Prerequisites for the example app

React-18next internationalization plugin - a higher order component to provide the i18next functionality to react components.

https://github.com/i18next/react-i18next

I18next-express-middleware - middleware to use i18next in express.js. Supports multiloading of backend routes, etc.

https://github.com/i18next/i18next-express-middleware


## Running the tests

'npm test' in the root directory

## Built With

* [i18next](http://i18next.com/) - Internationalization ecosystem
* [i18next-node-fs-backend](https://github.com/i18next/i18next-node-fs-backend/) - I18next node backend for node.js
* [react-i18next](https://github.com/i18next/react-i18next) - Internationalization for react done right.
* [i18next-express-middleware](https://github.com/i18next/i18next-express-middleware) - express middleware for i18next


## Versioning

// to do once published to npm

## Authors

* **Erik Suddath** -

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* Hat tip to anyone who's code was used
* Inspiration
* etc
