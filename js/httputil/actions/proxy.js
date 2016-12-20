var urllib = require("url");
var http = require("http");
var https = require("https");
var parseUrl = require("../parse-url");

module.exports = function(req, res, action) {
	if (action.to === undefined) {
		res.writeHead(500);
		return res.end("Option 'to' not provided");
	}

	var to = parseUrl(req, res, action.to);
	var url = urllib.parse(to);

	function onResponse(pres) {
		res.writeHead(pres.statusCode, pres.headers);
		pres.pipe(res);
	}

	var options = {
		host: url.host,
		hostname: url.hostname,
		port: url.port,
		method: req.method,
		path: url.path + req.url.substring(1),
		headers: req.headers
	}

	// 
	if (url.protocol === "https:") {
		preq = https.request(options, onResponse);
	} else if (url.protocol === "http:") {
		preq = http.request(options, onResponse);
	} else {
		res.writeHead(400);
		return res.end("Unknown protocol: "+url.protocol);
	}

	req.pipe(preq);

	preq.on("error", err => {
		res.writeHead(502);
		res.end(err.toString());
	});
}
