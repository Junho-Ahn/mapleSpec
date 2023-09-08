const path = require("path");

module.exports = {
	mode: "development",
	entry: "./public/javascripts/test.js",
	output: {
		filename: "test.js",
		path: path.resolve(__dirname, "dist")
	}
};