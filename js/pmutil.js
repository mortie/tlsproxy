var childProcess = require("child_process");

exports.run = run;
exports.proclist = proclist;
exports.cleanup = cleanup;

var processes = {};
var restartLimit = 10;

function format(proc, msg) {
	return "process "+proc.id+": "+msg;
}

function makeid(options) {
	var id = "'"+options.cmd+"'";
	id += " at "+options.dir;
	if (typeof options.host === "string")
		id += " for "+options.host;
	else if (options.host instanceof Array && options.host[0])
		id += " for "+options.host[0];

	return id;
}

function makename(options) {
	return options.name || makeid(options);
}

function exec(options, id) {
	var proc = childProcess.exec(options.cmd, {
		env: options.env,
		cwd: options.dir,
		uid: options.uid,
		gid: options.gid
	});
	proc.running = true;
	proc.name = makename(options);
	proc.id = id;
	processes[id] = proc;

	proc.stdout.on("data", d => {
		d = d.toString();
		d.split("\n").forEach(line => {
			if (line.trim() === "")
				return;

			console.log(format(proc, line));
		});
	});
	proc.stderr.on("data", d => {
		d = d.toString();
		d.split("\n").forEach(line => {
			if (line.trim() === "")
				return;

			console.error(format(proc, "stderr: "+line));
		});
	});

	return proc;
}

function run(options) {
	var id = makeid(options);
	if (processes[id])
		return console.log("Not starting process "+id+" because it already exists.");

	console.log(processes);
	console.log("Starting process "+id);

	var proc = exec(options, id);

	var restarts = 0;
	var restartsResetTimeout;

	function onexit(code) {
		if (!proc.running)
			return;

		console.error(format(proc,
			"Restarting after exit with code "+code));

		restarts += 1;
		if (restarts >= restartLimit) {
			console.error(format(proc,
				"Not restarting anymore after "+
				restarts+" restarts."));
			proc.running = false;
			return;
		}

		if (restartsResetTimeout) {
			clearTimeout(restartsResetTimeout);
			restartsResetTimeout = null;
		}

		restartsResetTimeout = setTimeout(() => {
			restarts = 0;
		}, 5000);

		proc = exec(options, id);
		proc.on("exit", onexit);
	}

	proc.on("exit", onexit);
}

function proclist() {
	var res = [];
	for (var i in processes) {
		if (!processes.hasOwnProperty(i))
			continue;

		var proc = processes[i];
		res.push({
			name: proc.name,
			running: proc.running
		});
	}
	return res;
}

function cleanup() {
	for (var i in processes) {
		if (!processes.hasOwnProperty(i))
			continue;

		var proc = processes[i];
		if (!proc || !proc.running)
			return;

		proc.running = false;
		proc.kill("SIGTERM");
	}
}
