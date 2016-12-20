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
		this.id = id;
		this.cmd = cmd;
		this.options = options;
		this.state = "stopped";
		this.running = false;

		this.restarts = 0;
		this.restartsResetTimeout = null;
		this.restartLimit = 15;

		console.log("Created process "+this.id);
	}

	onexit(code) {

		this.log("Process exited.");
		this.running = false;

		// If the process isn't supposed to be running,
		// just don't do anything
		if (this.state !== "running")
			return;

		this.state = "errored";

		if (this.restarts >= this.restartLimit) {
			this.log("Not restarting anymore after "+this.restarts+" restarts.");
			this.stop(function() {});
		} else {
			this.restarts += 1;

			this.log(
				"Restarting in "+this.restarts+" seconds "+
					"after exit with code "+code+".");

			if (this.restartsResetTimeout) {
				clearTimeout(this.restartsResetTimeout);
				this.restartsResetTimeout = null;
			}

			setTimeout(() => {
				this.start();
				this.restartsResetTimeout = setTimeout(() => {
					this.restarts = 0;
				}, 5000);
			}, this.restarts * 1000);
		}
	}

	start() {
		if (this.state === "running")
			throw "Process "+this.id+" already running.";

		this.log("Started process.");

		this.running = true;
		this.state = "running";
		this.proc = childProcess.exec(this.cmd, this.options);

		this.proc.stdout.on("data", d => {
			d.toString().split("\n").forEach(l => {
				if (l.trim() === "") return;
				this.log("stdout: "+l);
			});
		});
		this.proc.stderr.on("data", d => {
			d.toString().split("\n").forEach(l => {
				if (l.trim() === "") return;
				this.log("stderr: "+l);
			});
		});

		this.proc.on("exit", code => this.onexit(code));
	}

	stop(cb) {
		this.state = "stopped";
		this.proc.kill("SIGTERM");
		var cbd = false;

		// SIGKILL if we haven't exited in 2 seconds
		setTimeout(() => {
			if (this.state === "stopped" && this.running) {
				this.log("Killing process because it didn't stop on SIGTERM.");
				this.proc.kill("SIGKILL");

				if (!cbd) {
					cbd = true;

					setTimeout(cb, 100);
				}
			}
		}, 1000);

		setTimeout(() => {
			if (!this.running && !cbd) {
				cbd = true;
				setTimeout(cb, 100);
			}
		}, 0);
	}

	log(msg) {
		var str = "Process '"+this.id+"': "+msg;
		console.log(str);
	}

	serialize() {
		return {
			id: this.id,
			state: this.state,
			restarts: this.restarts
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
