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

// Calculate the display length of a string, stripping out escape codes
function reallen(str) {
	var len = 0;
	var inColor = 0;
	for (var i = 0; i < str.length; ++i) {
		var c = str[i];
		if (c === "\u001b") {
			inColor = 1;
		} else if (inColor === 1) {
			if (c === "[")
				inColor = 2;
		} else if (inColor === 2) {
			if (c === "m")
				inColor = 0;
		} else {
			len += 1;
		}
	}

	return len;
}

function printTable(arr) {
	var maxlen = [];

	var vline   = "\u2502".bold.grey; // │
	var hline   = "\u2500".bold.grey; // ─
	var vhcross = "\u253c".bold.grey; // ┼
	var vright  = "\u251c".bold.grey; // ├
	var vleft   = "\u2524".bold.grey; // ┤
	var hup     = "\u2534".bold.grey; // ┴
	var hdown   = "\u252c".bold.grey; // ┬
	var ctl     = "\u250c".bold.grey; // ┌
	var cbl     = "\u2514".bold.grey; // └
	var ctr     = "\u2510".bold.grey; // ┐
	var cbr     = "\u2518".bold.grey; // ┘

	// Calcutare the biggest lengths for each column
	arr.forEach(el => {
		el.forEach((s, i) => {
			s = s.toString();
			if (maxlen[i] === undefined || maxlen[i] < s.length)
				maxlen[i] = reallen(s);
		});
	});

	// Create pretty lines
	var tablesep = ""; // separator between names and values
	var tabletop = ""; // top of the table
	var tablebot = ""; // bottom of the table
	maxlen.forEach((n, i) => {
		tablesep += new Array(n + 3).join(hline);
		tabletop += new Array(n + 3).join(hline);
		tablebot += new Array(n + 3).join(hline);
		if (i !== maxlen.length - 1) {
			tablesep += vhcross;
			tabletop += hdown;
			tablebot += hup;
		}
	});
	tablesep = vright + tablesep + vleft;
	tabletop = ctl + tabletop + ctr;
	tablebot = cbl + tablebot + cbr;

	// Print the lines
	console.log(tabletop);
	arr.forEach((el, i) => {
		var line = "";
		el.forEach((s, j) => {
			s = s.toString();
			var len = maxlen[j];

			// The first row should be colored, as it's the titles
			if (i === 0)
				s = s.bold.cyan;

			// Right pad with spaces
			var missing = len - reallen(s);
			for (var k = 0; k < missing; ++k) s = s+" "

			// Add |s
			if (j !== 0)
				s = " "+vline+" "+s;

			line += s;
		});
		console.log(vline+" "+line+" "+vline);

		// Print the separator between the titles and the values
		if (i === 0)
			console.log(tablesep);
	});
	console.log(tablebot);
}

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
			var table = [
				[ "id", "state", "restarts" ]
			];
			r.forEach(proc => {
				var state = proc.state;
				if (state === "running") state = state.green.bold;
				else if (state === "stopped") state = state.yellow.bold;
				else state = state.red.bold;

				table.push([ proc.id, state, proc.restarts ]);
			});
			printTable(table);
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
