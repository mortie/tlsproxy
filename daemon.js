#!/usr/bin/env node

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/tlsproxy";

var fs = require("fs");
var pathlib = require("path");
var urllib = require("url");
var net = require("net");
var mkdirp = require("mkdirp");
var userid = require("./js/userid");
var certutil = require("./js/certutil");
var httputil = require("./js/httputil");
var pmutil = require("./js/pmutil");

var version = JSON.parse(
	fs.readFileSync(__dirname+"/package.json", "utf-8")).version

var conf = JSON.parse(fs.readFileSync(confpath+"/conf.json"));
conf.confpath = confpath;

if (conf.testing)
	console.log("Testing mode enabled.");

var sites = confpath+"/sites";
mkdirp.sync(sites);

function throwIfMissing(path, arr) {
	var missing = [];

	arr.forEach(elem => {
		if (elem[0] === undefined || elem[0] === null)
			missing.push(elem[1]);
	});

	if (missing.length > 0)
		throw "Missing keys "+missing.join(", ")+" at "+path;
}

function addAction(path, host, action) {
	throwIfMissing(path, [
		[host, "host"],
		[action, "action"]]);

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

function add(path, obj) {
	if (typeof obj !== "object")
		throw "Expected object, got "+(typeof obj)+" at "+path;

	if (obj.disabled)
		return;

	var host = obj.host;
	if (typeof host === "string")
		host = [host];
	else if (!(host instanceof Array))
		host = [];

	// Add action for each host
	host.forEach(h => {
		obj.host = h;
		addAction(path, h, obj.action);
	});

	var redirectFrom = obj.redirectFrom;
	if (typeof redirectFrom === "string")
		redirectFrom = [redirectFrom];
	else if (!(redirectFrom instanceof Array))
		redirectFrom = [];

	// Add redirect for each redirectFrom
	redirectFrom.forEach((r, i) => {
		if (host[i] === undefined)
			return;

		var action = {
			type: "redirect",
			to: host[i]+"/$path"
		};

		addAction(path, r, action);
	});

	// Execute command
	if (typeof obj.exec === "object") {
		var exec = obj.exec;
		throwIfMissing(path, [
			[exec.at, "exec.at"],
			[exec.run, "exec.run"],
			[exec.id, "exec.id"]
		]);

		// Add PORT env variable if proxy
		var env = exec.env || {};
		if (
				env.PORT === undefined &&
				obj.action !== undefined &&
				obj.action.type === "proxy") {

			var port = urllib.parse(obj.action.to).port;
			if (port)
				env.PORT = port;
		}

		// get GID and UID
		var user, group;
		var gid, uid;
		try {
			if (exec.group)
				group = exec.group;
			else
				group = conf.group;

			if (exec.user)
				user = exec.user;
			else
				user = conf.user;

			gid = userid.gid(group);
			uid = userid.uid(user);
		} catch (err) {
			console.error(
				err.toString()+" with user "+
				user+", group "+group+" at "+path);

			gid = null;
			uid = null;
		}

		if (gid !== null && uid !== null) {
			pmutil.add(exec.id, exec.run, {
				cwd: exec.at,
				env: env,
				gid: gid,
				uid: uid
			});
		}
	}
}

// Go through site files and add them
function load() {
	fs.readdirSync(sites).forEach(file => {
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
}
load();

// Remove the 
try {
	fs.accessSync(confpath+"/tlsproxy.sock", fs.F_OK);
	fs.unlinkSync(confpath+"/tlsproxy.sock");
} catch (err) {
	if (err.code !== "ENOENT")
		console.error(err);
}

function ipcServerHandler(name, data, write) {
	switch (name) {
	case "version":
		write({
			version: version
		});
		break;

	case "proc-list":
		write(pmutil.list());
		break;

	case "proc-start":
		pmutil.start(data.id);
		write();
		break;

	case "proc-stop":
		pmutil.stop(data.id, () => {
			write();
		});
		break;

	case "proc-restart":
		pmutil.restart(data.id, () => {
			write();
		});
		break;

	default:
		write();
	}
}

var ipcServer = net.createServer(conn => {
	function send(obj) {
		conn.end(JSON.stringify(obj || {}));
	}

	conn.on("data", d => {
		try {
			var obj = JSON.parse(d);
			ipcServerHandler(obj.name, obj.data, send);
		} catch (err) {
			try {
				send({
					error: err.toString()
				});
			} catch (err) {
				console.error("Couldn't write to ipc socket");
			}
			console.trace(err);
		}
	});
});
ipcServer.listen(confpath+"/tlsproxy.sock")
ipcServer.on("error", err => {
	console.log("Could not connect to "+confpath+"/tlsproxy.sock:");
	console.error(err.toString());
	process.exit(1);
});

function onTerm() {
	pmutil.cleanup();
	ipcServer.close(() => {
		console.log("exiting");
		process.exit(1);
	});

	// IPC server may hang, we want to exit even if that happens
	setTimeout(() => process.exit(1), 1000);
}

process.on("SIGTERM", onTerm);
process.on("SIGINT", onTerm);
