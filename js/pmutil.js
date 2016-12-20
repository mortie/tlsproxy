var childProcess = require("child_process");

exports.add = add;
exports.list = list;
exports.start = start;
exports.stop = stop;
exports.restart = restart;
exports.cleanup = cleanup;

var processes = {};
var restartLimit = 10;

class Process {
	constructor(id, run, options) {
		this.proc = null;
		this.id = id;
		this.cmd = run[0];
		this.args = [];
		this.options = options;
		this.state = "stopped";
		this.running = false;

		for (var i = 1; i < run.length; ++i)
			this.args.push(run[i]);

		this.restarts = 0;
		this.restartsResetTimeout = null;
		this.restartLimit = 15
	}

	onexit(code) {
		this.log("Process exited with code "+code+".");
		this.running = false;

		if (this.state === "stopped")
			return;

		this.state = "errored";

		if (this.restarts >= this.restartLimit) {
			this.log("Not restarting anymore after "+this.restarts+" restarts.");
			this.stop();
			this.state = "errored";
			return;
		}

		this.restarts += 1;

		this.log("Restarting in "+this.restarts+" seconds.");

		if (this.restartsResetTimeout) {
			clearTimeout(this.restartsResetTimeout);
			this.restartsResetTimeout = null;
		}

		setTimeout(() => {
			if (this.state === "stopped") {
				this.log("Not restarting anymore because state is stopped.");
				return;
			}

			this.start();
			this.restartsResetTimeout = setTimeout(() => {
				this.restarts = 0;
			}, 5000);
		}, this.restarts * 1000);
	}

	start() {
		if (this.state === "running")
			throw "Process "+this.id+" already running.";

		this.state = "running";
		this.proc = childProcess.spawn(this.cmd, this.args, this.options);
		this.running = true;
		this.log("Started process with pid "+this.proc.pid+".");

		this.proc.stdout.on("data", d => {
			this.log(d.toString(), "stdout");
		});
		this.proc.stderr.on("data", d => {
			this.log(d.toString(), "stderr");
		});

		this.proc.on("error", err => {
			this.trace(err);
			this.state = "errored";
			this.running = false;
		});

		this.proc.on("exit", code => this.onexit(code));
	}

	stop(cb) {
		if (!this.running && this.state === "stopped")
			return cb();

		cb = cb || function() {};

		this.state = "stopped";
		this.proc.kill("SIGTERM");

		var done = false;

		// SIGKILL if we haven't exited after a bit
		setTimeout(() => {
			if (this.running && !done) {
				done = true;
				this.log("Killing process because it didn't stop on SIGTERM.");
				this.proc.kill("SIGKILL");
				this.running = false;
				this.state = "stopped";

				setTimeout(cb, 100);
			} else if (!this.running && !done) {
				cb();
			}
		}, 1000);

		// If we exit immediately, SIGTERM isn't necessary
		setTimeout(() => {
			if (!this.running && !done) {
				done = true;
				cb();
			}
		}, 100);
	}

	log(msg, prefix) {
		msg = msg.substring(0, msg.length - 1);
		msg.split("\n").forEach(l => {
			if (prefix)
				l = prefix+": "+l;

			console.log("Process '"+this.id+"': "+l);
		});
	}

	trace(err) {
		console.log("Process '"+this.id+"': Error:");
		console.trace(err);
	}

	serialize() {
		return {
			id: this.id,
			state: this.state,
			restarts: this.restarts
		};
	}
}

function add(id, run, options) {
	if (!(run instanceof Array))
		throw "Expected run to be an array, got "+(typeof run);

	var proc = new Process(id, run, options);
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
	if (proc.state === "running")
		throw "Process "+id+" is already running.";

	proc.start();
}

function stop(id, cb) {
	var proc = processes[id];
	if (!proc)
		throw "Process "+id+" doesn't exist.";
	if (proc.state === "stopped")
		throw "Process "+id+" is already stopped.";

	proc.stop(cb);
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
