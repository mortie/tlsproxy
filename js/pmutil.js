var childProcess = require("child_process");

exports.run = run;
exports.proclist = proclist;
exports.cleanup = cleanup;

var processes = [];
var restartLimit = 10;

function format(id, cmd, msg) {
	return "process "+id+" ("+cmd+"): "+msg;
}

function exec(id, dir, cmd, env, gid, uid) {
	var proc = childProcess.exec(cmd, {
		env: env,
		cwd: dir,
		uid: uid,
		gid: gid
	});
	proc.running = true;
	proc.id = id;
	proc.cmd = cmd;
	processes[id] = proc;

	proc.stdout.on("data", d => {
		d = d.toString();
		d.split("\n").forEach(line => {
			if (line.trim() === "")
				return;

			console.log(format(id, cmd, line));
		});
	});
	proc.stderr.on("data", d => {
		d = d.toString();
		d.split("\n").forEach(line => {
			if (line.trim() === "")
				return;

			console.error(format(id, cmd, "stderr: "+line));
		});
	});

	return proc;
}

function run(dir, cmd, env, gid, uid) {
	var id = processes.length;

	var proc = exec(id, dir, cmd, env, gid, uid);

	var restarts = 0;
	var restartsResetTimeout;

	function onexit(code) {
		if (!proc.running)
			return;

		console.error(format(id, cmd, 
			"trying to restart "+
			"after exit with code "+code));

		restarts += 1;
		if (restarts >= restartLimit) {
			console.error(format(id, cmd,
				"process "+id+" ("+cmd+"): not restarting anymore after "+
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

		proc = exec(id, dir, cmd, env, gid, uid);
		proc.on("exit", onexit);
	}

	proc.on("exit", onexit);
}

function proclist() {
	var res = [];
	processes.forEach(proc => {
		res.push({
			id: proc.id,
			cmd: proc.cmd,
			running: proc.running
		});
	});
	return res;
}

function cleanup(cb) {
	var cbs = 0;
	processes.forEach(proc => {
		cbs += 1;

		if (!proc || !proc.running)
			return;

		proc.running = false;
		proc.kill(() => {
			cbs -= 1;
			if (cbs === 0)
				cb();
		});
	});

	if (cbs === 0)
		cb();
}
