To run example app:

Example
	-build
	-locales
	-node_modules
	-public
	-server
	-src
	-style
	-package.json
	-webpack.config

- npm install in main directory
- cd example and npm install 

Example app scrips:
	-npm run build (to build directory);
	-npm start (to run server)


Server is currently configured to point at i18next in example directory

plugin will automatically upload any changes made to source files in
locales/i18next/en to qordoba project

will ping qordoba every 10 seconds for any changes to target language files
