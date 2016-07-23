var http = require("http");
var https = require("https");
var urllib = require("url");
var certutil = require("../js/certutil");

exports.host = host;

function parseUrl(req, res, url) {
	return url
		.replace(/\$host/g, req.headers.host)
		.replace(/\$path/g, req.url.substring(1));
}

var actions = {
	"redirect": function(req, res, action) {
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

	"proxy": function(req, res, action) {
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

		preq.on("error", function(err) {
			res.writeHead(502);
			res.end(err.toString());
		});
	}
}

function Server(port, protocol) {
	var self = {};

	var domains = {};

	function onRequest(req, res) {
		var domain = req.headers.host.split(":")[0];
		var action = domains[domain];

		if (action === undefined)
			return res.end("Unknown host: "+domain);

		actions[action.type](req, res, action);
	}

	var srv;
	if (protocol === "https:") {
		var opts = {
		}
		srv = https.createServer(opts, onRequest);
	} else if (protocol === "http:") {
		srv = http.createServer(onRequest);
	} else {
		throw "Unknown protocol: "+protocol;
	}

	srv.listen(port);
	console.log(protocol+" listening on port "+port);

	self.addDomain = function(domain, action) {
		if (actions[action.type] === undefined)
			throw "Unknown action type: "+action.type+" for "+domain;

		domains[domain] = action;
	}

	return self;
}

var servers = {};

function host(domain, port, protocol, action) {
	var srv = servers[port];
	if (srv == undefined) {
		srv = Server(port, protocol);
		servers[port] = srv;
	}

	srv.addDomain(domain, action);
}
