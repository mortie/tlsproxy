var spawnSync = require("child_process").spawnSync;

exports.uid = function(user) {
	var res = spawnSync("id", [
		"--user", user
	]);
	var n = parseInt(res.stdout);

	if (isNaN(n)) return false;
	else return n;
}

exports.gid = function(group) {
	var res = spawnSync("id", [
		"--group", group
	]);
	var n = parseInt(res.stdout);

	if (isNaN(n)) return false;
	else return n;
}
