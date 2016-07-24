var childProcess = require("child_process");

exports.run = run;

var processes = [];
var restartLimit = 10;

function exec(dir, cmd, env) {
	return childProcess.exec(cmd, {
		env: env
	});
}

function run(dir, cmd, env) {
	var id = processes.length;

	var proc = exec(dir, cmd, env);
	processes[id] = proc;

	var restarts = 0;
	var restartsResetTimeout;

	function onexit(code) {
		console.error(
			"process "+id+" ("+cmd+"): trying to restart "+
			"after exit with code "+code);

		restarts += 1;
		if (restarts >= restartLimit) {
			console.error(
				"process "+id+" ("+cmd+"): not restarting anymore after "+
				restarts+" restarts.");
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

		proc = exec(dir, cmd, env);
		processes[id] = proc;
		proc.on("exit", onexit);
	}

	proc.on("exit", onexit);
}
