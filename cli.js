#!/usr/bin/env node

var colors = require("colors");

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/tlsproxy";

var defaultGroup = "www-data";
var defaultUser = "www-data";

var fs = require("fs");
var net = require("net");
var mkdirp = require("mkdirp");

var version = JSON.parse(
	fs.readFileSync(__dirname+"/package.json", "utf-8")).version;

function copy(p1, p2) {
	var rs = fs.createWriteStream(p2);
	fs.createReadStream(p1).pipe(rs);
}

function fileExists(path) {
	try {
		fs.accessSync(path, fs.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

function ipcConn() {
	var conn;
	try {
		conn = net.createConnection(confpath+"/tlsproxy.sock");

		function send(name, data, cb) {
			var obj = {
				name: name,
				data: data
			};
			conn.write(JSON.stringify(obj));

			conn.once("data", d => {
				var obj = JSON.parse(d);
				if (obj.error) {
					console.error(obj.error);
					process.exit(1);
				}
				cb(obj);
			});
		}

		return {
			send: send,
		};
	} catch (err) {
		if (err.code === "ENOENT")
			throw "tlsproxy is not running!";
		else
			console.trace(err);
	}
	return conn;
}

var cmds = {
	"help": function() {
		console.log("Usage: "+process.argv[1]+" <command>");
		console.log("commands:");
		console.log("\thelp:      show this help text");
		console.log("\tversion:    show the version");
		console.log("\tsetup:     set up init scripts and conf file");
		console.log("\tproc-list: list processes managed by tlsproxy");
		console.log("\tproc-start <id>: start a process");
		console.log("\tproc-stop <id>: stop a process");
		console.log("\tproc-restart <id>: restart a process");
	},

	"version": function() {
		var conn = ipcConn();
		conn.send("version", {}, r => {
			var srvver = r.version;
			console.log("Client version: "+version);
			console.log("Server version: "+srvver);
			process.exit();
		});
	},
	"--version": function() { cmds.version(); },

	"setup": function() {
		if (process.platform !== "linux")
			return console.log("Setup only supports Linux.");

		mkdirp.sync(confpath);
		mkdirp.sync(confpath+"/sites");

		mkdirp.sync("/opt/tlsproxy");
		if (fileExists ("/opt/tlsproxy/daemon.js"))
			fs.unlinkSync("/opt/tlsproxy/daemon.js");
		fs.symlinkSync(__dirname+"/daemon.js", "/opt/tlsproxy/daemon.js");

		// Default config
		if (!fileExists(confpath+"/conf.json")) {
			fs.writeFileSync(confpath+"/conf.json", JSON.stringify({
				email: "example@example.com",
				testing: true,
				group: defaultGroup,
				user: defaultUser
			}, null, 4));
			console.log(confpath+"/conf.json created. Please edit.");
		}

		var initpath = fs.realpathSync("/proc/1/exe");

		// systemd
		if (initpath.indexOf("systemd") != -1) {
			copy(
				__dirname+"/init/tlsproxy.service",
				"/etc/systemd/system/tlsproxy.service");
			console.log("tlsproxy installed.");
			console.log("Enable with 'systemctl enable tlsproxy',");
			console.log("then start with 'systemctl start tlsproxy'");
		} else {
			console.log("Systemd not detected, no unit file will be installed.")
		}
	},

	"reload": function() {
		var conn = ipcConn();
		conn.send("reload", {}, r => {
			console.log("Reloaded.");
			process.exit();
		});
	},

	"proc-list": function() {
		var conn = ipcConn();
		conn.send("proc-list", {}, r => {
			console.log("Processes:");
			r.forEach(proc => {
				var state = proc.state;
				if (state === "running") state = state.green.bold;
				else if (state === "stopped") state = state.yellow.bold;
				else state = state.red.bold;

				console.log(
					"id: "+proc.id+", "+
					"state: "+state+", "+
					"restarts: "+proc.restarts);
			});
			process.exit();
		});
	},

	"proc-start": function() {
		var conn = ipcConn();
		conn.send("proc-start", { id: process.argv[3] }, r => {
			cmds["proc-list"]();
		});
	},

	"proc-stop": function() {
		var conn = ipcConn();
		conn.send("proc-stop", { id: process.argv[3] }, r => {
			cmds["proc-list"]();
		});
	},

	"proc-restart": function() {
		var conn = ipcConn();
		conn.send("proc-restart", { id: process.argv[3] }, r => {
			cmds["proc-list"]();
		});
	}
};

if (cmds[process.argv[2]])
	cmds[process.argv[2]]();
else
	cmds.help();
