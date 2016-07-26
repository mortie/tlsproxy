var childProcess = require("child_process");

exports.run = run;
exports.proclist = proclist;
exports.cleanup = cleanup;

var processes = [];
var restartLimit = 10;

function format(proc, msg) {
	return "process "+proc.id+" ("+proc.name+"): "+msg;
}

function exec(options, id) {
	var proc = childProcess.exec(cmd, {
		env: options.env,
		cwd: options.dir,
		uid: options.uid,
		gid: options.gid
	});
	proc.running = true;
	proc.id = id;
	proc.cmd = cmd;
	if (typeof options.name === "string") {
		proc.name = options.name;
	} else {
		proc.name = "'"+options.cmd+"'";
		proc.name += " at "+options.dir;
		if (typeof options.host === "string")
			proc.name += " for "+options.host;
		else if (options.host instanceof Array && options.host[0])
			proc.name += " for "+options.host[0];
	}
	processes[options.id] = proc;

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

			console.error(proc, "stderr: "+line));
		});
	});

	return proc;
}

function run(options) {
	var id = processes.length;

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
	processes.forEach(proc => {
		res.push({
			id: proc.id,
			name: proc.name,
			running: proc.running
		});
	});
	return res;
}

function cleanup() {
	processes.forEach(proc => {
		if (!proc || !proc.running)
			return;

		proc.running = false;
		proc.kill("SIGTERM");
	});
}
