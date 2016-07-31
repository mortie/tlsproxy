var http = require("http");
var https = require("https");
var urllib = require("url");
var pathlib = require("path");
var fs = require("fs");
var mime = require("mime");
var certutil = require("../js/certutil");

exports.host = host;
exports.cleanup = cleanup;

function parseUrl(req, res, url) {
	return url
		.replace(/\$host/g, req.headers.host)
		.replace(/\$path/g, req.url.substring(1));
}

var actions = {

	// Redirect to action.to
	redirect: function(req, res, action) {
		if (action.to === undefined) {
			res.writeHead(500);
			return res.end("Option 'to' not provided");
		}

		var code = 302;
		if (action.code)
			code = action.code;

		var to = parseUrl(req, res, action.to);
		res.writeHead(code, {
			"location": to
		});
		res.end("Redirecting to "+to);
	},

	// Proxy to action.to
	proxy: function(req, res, action) {
		if (action.to === undefined) {
			res.writeHead(500);
			return res.end("Option 'to' not provided");
		}

		var to = parseUrl(req, res, action.to);
		var url = urllib.parse(to);

		var preq;
		function onResponse(pres) {
			res.writeHead(pres.statusCode, pres.headers);
			pres
				.on("data", d => res.write(d))
				.on("end", () => res.end());
		}

		var options = {
			host: url.host,
			hostname: url.hostname,
			port: url.port,
			method: req.method,
			path: url.path + req.url.substring(1),
			headers: req.headers
		}

		if (url.protocol === "https:") {
			preq = https.request(options, onResponse);
		} else if (url.protocol === "http:") {
			preq = http.request(options, onResponse);
		} else {
			res.writeHead(400);
			return res.end("Unknown protocol: "+url.protocol);
		}

		req
			.on("data", d => preq.write(d))
			.on("end", () => preq.end());

		preq.on("error", err => {
			res.writeHead(502);
			res.end(err.toString());
		});
	},

	serve: function(req, res, action) {
		if (action.path === undefined) {
			res.writeHead(500);
			return res.end("Option 'path' not provided");
		}

		var path = pathlib.join(action.path, req.url);
		if (path.indexOf(action.path) !== 0) {
			res.writeHead(403);
			return res.end("Unauthorized");
		}

		var index = action.index;
		if (index === undefined || index === null) {
			index = ["index.html", "index.htm"];
		} else if (typeof index === "string") {
			index = [index];
		} else {
			res.writeHead(500);
			return res.end("Option 'index' is invalid");
		}

		serve(req, res, path, index);
	},

	none: function() {}
}

function Server(conf, port, protocol) {
	var self = {};

	var domains = {};

	function onRequest(req, res) {
		if (typeof req.headers.host !== "string") {
			res.writeHead(400);
			res.end("No host header!");
			console.log("Received request with no host header.");
			return;
		}

		var domain = req.headers.host.split(":")[0];
		var action = domains[domain];

		if (action === undefined)
			return res.end("Unknown host: "+domain);

		actions[action.type](req, res, action);
	}

	// Create http/https server
	var srv;
	if (protocol === "https:") {
		var opts = {
			SNICallback: certutil.sniCallback
		};
		srv = https.createServer(opts, certutil.acmeResponder(onRequest));
	} else if (protocol === "http:") {
		srv = http.createServer(certutil.acmeResponder(onRequest));
	} else {
		throw "Unknown protocol: "+protocol;
	}

	// Listen
	srv.listen(port);
	console.log(protocol+" listening on port "+port);

	self.addDomain = function(domain, action) {
		if (actions[action.type] === undefined)
			throw "Unknown action type: "+action.type+" for "+domain;

		domains[domain] = action;

		if (protocol === "https:") {
			certutil.register(conf, domain);
		}
	}

	self.close = function(cb) {
		srv.close(cb);
	}

	return self;
}

var servers = {};

function host(conf, domain, port, protocol, action) {

	// Get or create server for port
	var srv = servers[port];
	if (srv == undefined) {
		srv = Server(conf, port, protocol);
		servers[port] = srv;
	}

	// Add the domain to server
	srv.addDomain(domain, action);

	// Need an HTTP server for letsencrypt
	if (servers[80] == undefined && protocol === "https:") {
		servers[80] = Server(conf, 80, "http:");
	}
}

function cleanup(cb) {
	var cbs = 0;

	for (var i in servers) {
		if (!servers.hasOwnProperty(i))
			continue;

		cbs += 1;
		servers[i].close(() => {
			cbs -= 1;
			if (cbs === 0)
				cb();
		});
	}

	if (cbs === 0)
		cb();
}

function serveDirectory(req, res, path, index) {
	// Add / to the end if it doesn't exist already
	if (path[path.length - 1] !== "/") {
		res.writeHead(302, {
			location: path+"/"
		});
		res.end("Redirecting to "+path+"/");

	// Serve index
	} else {
		var valid = [];
		var cbs = index.length;

		function accessCb(err, name, i) {
			if (!err)
				valid[i] = name;

			cbs -= 1;
			if (cbs !== 0)
				return;

			var idx = null;
			for (var j = 0; j < index.length; ++j) {
				if (valid[j]) {
					idx = valid[j];
					break;
				}
			}

			if (idx === null) {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
				return;
			}
			serveFile(req, res, pathlib.join(path, idx));
		}

		index.forEach((name, i) => {
			fs.access(pathlib.join(path, name), fs.F_OK, err => {
				accessCb(err, name, i);
			});
		});
	}
}

function serveFile(req, res, path, stat) {
	if (!stat) {
		fs.stat(path, (err, stat) => {
			if (err && err.code === "ENOENT") {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
				return;
			}

			serveFile(req, res, path, stat);
		});
		return;
	}

	var mimetype = mime.lookup(path);
	var readstream;

	var range = req.headers.range;

	var parts;
	if (range)
		parts = range.replace("bytes=", "").split("-");
	else
		parts = [0];

	var start = Math.max((parts[0] || 0), 0);
	var end;
	if (parts[1])
		end = Math.min(parseInt(parts[1]), stat.size - 1);
	else
		end = stat.size - 1;

	var chunksize = (end - start) + 1;

	var headers = {
		"content-type": mimetype,
		"content-length": chunksize,
	};
	if (range) {
		headers["content-range"] =
			"bytes " + start + "-" + end + "/" + stat.size;
	} else {
		headers["accept-ranges"] =  "bytes";
	}

	res.writeHead(range ? 206 : 200, headers);

	if (req.method == "HEAD") {
		res.end();
		return;
	}

	fs.createReadStream(path, { start: start, end: end })
		.on("data", d => res.write(d))
		.on("end", () => console.log("end"))
		.on("error", err => res.end(err.toString()));
}

function serve(req, res, path, index) {
	fs.stat(path, (err, stat) => {
		if (err) {
			if (err.code === "ENOENT") {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
			} else {
				res.writeHead(500);
				res.end(err.toString());
			}
			return;
		}

		if (stat.isDirectory()) {
			serveDirectory(req, res, path, index);
		} else if (stat.isFile()) {
			serveFile(req, res, path, stat);
		} else {
			res.writeHead(500);
			res.end("Invalid path requested");
		}
	});
}
