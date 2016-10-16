var childProcess = require("child_process");

exports.run = run;
exports.list = list;
exports.start = start;
exports.stop = stop;
exports.restart = restart;
exports.cleanup = cleanup;

var processes = {};
var restartLimit = 10;

class Process {
	constructor(id, cmd, options) {
		this.proc = null;
		this.running = false;
		this.stopped = true;
		this.id = id;
		this.cmd = cmd;
		this.options = options;

		this.totalRestarts = 0;
		this.restarts = 0;
		this.restartsResetTimeout = null;
		this.restartLimit = 5;

		console.log("Created process "+this.id);
	}

	onexit(code) {
		this.running = false;

		// If the process exits, but we haven't stopped it, try to restart it
		if (!this.stopped) {

			if (this.restarts >= this.restartLimit) {
				this.formatMsg("Not restarting anymore after "+this.restarts+" restarts.");
			} else {
				this.formatMsg("Restarting after exit with code "+code);
				this.restarts += 1;
				this.totalRestarts += 1;
				this.start();

				if (this.restartsResetTimeout) {
					clearTimeout(this.restartsResetTimeout);
					this.restartsResetTimeout = null;
				}
				this.restartsResetTimeout = setTimeout(() => {
					this.restarts = 0;
				}, 5000);
			}
		}
	}

	start() {
		if (this.running && !this.stopped)
			throw "Process "+this.id+" already running.";

		this.stopped = false;
		this.running = true;
		this.proc = childProcess.exec(this.cmd, this.options);

		this.proc.stdout.on("data", d => {
			console.log("on stdout");
			d.toString().split("\n").forEach(l => {
				if (l.trim() === "") return;
				this.formatMsg(l);
			});
		});
		this.proc.stderr.on("data", d => {
			console.log("on stderr");
			d.toString().split("\n").forEach(l => {
				if (l.trim() === "") return;
				this.formatMsg("stderr: "+l);
			});
		});

		this.proc.on("exit", code => this.onexit(code));
	}

	stop(cb) {
		this.stopped = true;
		this.proc.kill("SIGTERM");
		var cbd = false;

		// SIGKILL if we haven't exited in 2 seconds
		setTimeout(() => {
			if (this.stopped && this.running) {
				console.log("Killing process "+this.id+" because it didn't stop on SIGTERM.");
				this.proc.kill("SIGKILL");

				if (!cbd) {
					cb();
					cbd = true;
				}
			}
		}, 1000);

		setTimeout(() => {
			if (!this.running && !cbd) {
				cb();
				cbd = true;
			}
		}, 0);
	}

	formatMsg(msg) {
		console.log("process "+this.id+": "+msg);
	}

	serialize() {
		var state;
		if (this.stopped && !this.running) state = "stopped";
		else if (!this.stopped && this.running) state = "running";
		else if (!this.stopped && !this.running) state = "errored";
		else state = "invalid";

		return {
			id: this.id,
			state: state,
			restarts: this.totalRestarts
		};
	}
}

function run(id, cmd, options) {
	var proc = new Process(id, cmd, options);
	processes[proc.id] = proc;
	proc.start();
}

function list() {
	var res = [];
	for (var i in processes) {
		if (!processes.hasOwnProperty(i))
			continue;

		var proc = processes[i];
		res.push(proc.serialize());
	}
	return res;
}

function start(id) {
	var proc = processes[id];
	if (!proc)
		throw "Process "+id+" doesn't exist.";
	if (proc.running)
		throw "Process "+id+" is already running.";

	proc.start();
}

function stop(id, cb) {
	var proc = processes[id];
	if (!proc)
		throw "Process "+id+" doesn't exist.";
	if (proc.stopped)
		throw "Process "+id+" is already stopped.";

	proc.stop(() => {
		cb();
	});
}

function restart(id, cb) {
	var proc = processes[id];
	if (!proc)
		throw "Process "+id+" doesn't exist.";

	function h() {
		proc.start();
		cb();
	}

	if (!proc.stopped)
		proc.stop(h);
	else
		h();
}

function cleanup() {
	for (var i in processes) {
		if (!processes.hasOwnProperty(i))
			continue;

		var proc = processes[i];
		if (!proc || !proc.running)
			continue;

		proc.stop();
	}
}
