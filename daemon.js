#!/usr/bin/env node

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/mproxy";

var fs = require("fs");
var pathlib = require("path");
var urllib = require("url");
var mkdirp = require("mkdirp");
var certutil = require("./js/certutil");
var httputil = require("./js/httputil");

var conf = JSON.parse(fs.readFileSync(confpath+"/conf.json"));

var sites = confpath+"/sites";
mkdirp.sync(sites);

function add(path, obj) {
	if (typeof obj !== "object")
		throw "Expected object, got "+(typeof obj)+" at "+path;

	var host = obj.host;
	var action = obj.action;

	var missing = [];
	if (host === undefined)
		missing.push("host");
	if (action === undefined)
		missing.push("action");
	if (missing.length > 0)
		throw "Missing keys "+missing.join(", ")+" at "+path;

	var url = urllib.parse(host);

	var port = url.port;
	var protocol = url.protocol;
	var domain = url.hostname;

	if (port === null) {
		if (protocol === "http:")
			port = 80;
		else if (protocol === "https:")
			port = 443;
	}

	try {
		httputil.host(conf, domain, port, protocol, action);
	} catch (err) {
		console.trace(err);
		throw err.toString()+" at "+path;
	}
}

fs.readdirSync(sites).forEach(function(file) {
	var path = pathlib.join(sites, file);

	var site;
	try {
		site = JSON.parse(fs.readFileSync(path));
	} catch (err) {
		throw "Failed to parse "+path+": "+err.toString();
	}

	if (site instanceof Array)
		site.forEach(x => add(path, x));
	else if (typeof site == "object")
		add(path, site);
	else
		throw "Expected array or object, got "+(typeof site)+" at "+path;
});
