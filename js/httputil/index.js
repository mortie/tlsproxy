var http = require("http");
var https = require("https");
var urllib = require("url");
var mime = require("mime");
var certutil = require("../certutil");
var WSProxy = require("./wsproxy");

exports.host = host;

var actions = {
	redirect: require("./actions/redirect"),
	proxy: require("./actions/proxy"),
	serve: require("./actions/serve"),
	none: function() {}
}

function Server(conf, port, protocol) {
	var self = {};

	var domains = {};
	var wsdomains = {};

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

		var h = actions[action.type];
		if (!h) {
			res.writeHead(500);
			res.end("Unknown action type: "+ation.type);
			return;
		}
		h(req, res, action);
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

	// Create websocket server
	var wssrv = WSProxy(wsdomains, srv);

	self.addDomain = function(domain, action) {
		if (actions[action.type] === undefined)
			throw "Unknown action type: "+action.type+" for "+domain;

		domains[domain] = action;

		if (action.type === "proxy" && typeof action.websocket === "string")
			wsdomains[domain] = action;

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
