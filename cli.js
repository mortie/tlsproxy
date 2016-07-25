#!/usr/bin/env node

var confpath = process.env.PROXY_CONF;
if (!confpath)
	confpath = "/etc/mproxy";

var defaultGroup = "www-data";
var defaultUser = "www-data";

var fs = require("fs");
var net = require("net");
var mkdirp = require("mkdirp");

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
	return net.createConnection(confpath+"/mproxy.sock");
}

var cmds = {
	"help": function() {
		console.log("Usage: "+process.argv[1]+" <command>");
		console.log("commands:");
		console.log("\thelp:  show this help text");
		console.log("\tsetup: set up init scripts and conf file");
	},

	"setup": function() {
		if (process.platform !== "linux")
			return console.log("setup only supports Linux.");

		mkdirp.sync(confpath);
		mkdirp.sync(confpath+"/sites");

		mkdirp.sync("/opt/mproxy");
		fs.symlinkSync(__dirname+"/daemon.js", "/opt/mproxy/daemon.js");

		// Default config
		if (!fileExists(confpath+"/conf.json")) {
			fs.writeFileSync(confpath+"/conf.json", JSON.stringify({
				email: "example@example.com",
				group: defaultGroup,
				user: defaultUser
			}, null, 4));
			console.log(confpath+"/conf.json created. Please edit.");
		}

		var initpath = fs.realpathSync("/proc/1/exe");

		// systemd
		if (initpath.indexOf("systemd") != -1) {
			copy(
				__dirname+"/init/mproxy.service",
				"/etc/systemd/system/mproxy.service");
			console.log("mproxy installed.");
			console.log("Enable with 'systemctl enable mproxy',");
			console.log("then start with 'systemctl start mproxy'");
		} else {
			console.log("setupInit only supports systemd.");
		}
	},

	"proc-list": function() {
		var conn = ipcConn();
		conn.write("proc-list");
		conn.once("data", d => {
			var obj = JSON.parse(d);
			console.log("Processes:");
			obj.forEach(proc => {
				console.log(
					"id: "+proc.id+", "+
					"running: "+proc.running+", "+
					"command: "+proc.cmd);
			});
			process.exit();
		});
	}
};

if (cmds[process.argv[2]])
	cmds[process.argv[2]]();
else
	cmds.help();
