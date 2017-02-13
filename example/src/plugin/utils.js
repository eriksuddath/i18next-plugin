// var fs = require('fs');

// const getLanguages = (path, callback) => {
// 	fs.readdir(path, (err, items) => {
//     console.log(items);
 
//     for (var i=0; i<items.length; i++) {
//         console.log(items[i]);
//     }
// 	});
// }

// const getJSONFilePaths = (path, callback) => {
// 	fs.readdir(path, (err, items) => {
// 		console.log(items);
// 	})
// }

// module.exports = getLanguages;

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Robert Krüger
*/
var fs = require("fs");

var loaderUtils = require('loader-utils');

module.exports = function (indexContent) {
	var resBundle = { en: ['jumbo', 'common'], 'es': ['jumbo', 'common']};
	return "module.exports = " + JSON.stringify(resBundle);
}