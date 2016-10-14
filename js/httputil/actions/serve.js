var pathlib = require("path");
var fs = require("fs");
var mime = require("mime");

module.exports = function(req, res, action) {
	if (action.path === undefined) {
		res.writeHead(500);
		return res.end("Option 'path' not provided");
	}

	var path = pathlib.join(action.path, req.url);
	if (path.indexOf(action.path) !== 0) {
		res.writeHead(403);
		return res.end("Unauthorized");
	}

	var index = action.index;
	if (index === undefined || index === null) {
		index = ["index.html", "index.htm"];
	} else if (typeof index === "string") {
		index = [index];
	} else {
		res.writeHead(500);
		return res.end("Option 'index' is invalid");
	}

	serve(req, res, path, index);
}

function serveDirectory(req, res, path, index) {
	// Add / to the end if it doesn't exist already
	if (req.url[req.url.length - 1] !== "/") {
		res.writeHead(302, {
			location: req.url+"/"
		});
		res.end("Redirecting to "+req.url+"/");

	// Serve index
	} else {
		var valid = [];
		var cbs = index.length;

		function accessCb(err, name, i) {
			if (!err)
				valid[i] = name;

			cbs -= 1;
			if (cbs !== 0)
				return;

			var idx = null;
			for (var j = 0; j < index.length; ++j) {
				if (valid[j]) {
					idx = valid[j];
					break;
				}
			}

			if (idx === null) {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
				return;
			}
			serveFile(req, res, pathlib.join(path, idx));
		}

		index.forEach((name, i) => {
			fs.access(pathlib.join(path, name), fs.F_OK, err => {
				accessCb(err, name, i);
			});
		});
	}
}

function serveFile(req, res, path, stat) {
	if (!stat) {
		fs.stat(path, (err, stat) => {
			if (err && err.code === "ENOENT") {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
				return;
			}

			serveFile(req, res, path, stat);
		});
		return;
	}

	var mimetype = mime.lookup(path);
	var readstream;

	var range = req.headers.range;

	var parts;
	if (range)
		parts = range.replace("bytes=", "").split("-");
	else
		parts = [0];

	var start = Math.max((parts[0] || 0), 0);
	var end;
	if (parts[1])
		end = Math.min(parseInt(parts[1]), stat.size - 1);
	else
		end = stat.size - 1;

	var chunksize = (end - start) + 1;

	var headers = {
		"content-type": mimetype,
		"content-length": chunksize,
	};
	if (range) {
		headers["content-range"] =
			"bytes " + start + "-" + end + "/" + stat.size;
	} else {
		headers["accept-ranges"] =  "bytes";
	}

	if (start > end) {
		res.writeHead(416);
		res.end("Range not satisfiable. Start: "+start+", end: "+end);
		return;
	}

	res.writeHead(range ? 206 : 200, headers);

	if (req.method == "HEAD") {
		res.end();
		return;
	}

	fs.createReadStream(path, { start: start, end: end })
		.on("data", d => res.write(d))
		.on("end", () =>  res.end())
		.on("error", err => res.end(err.toString()));
}

function serve(req, res, path, index) {
	fs.stat(path, (err, stat) => {
		if (err) {
			if (err.code === "ENOENT") {
				res.writeHead(404);
				res.end("404 not found: "+req.url);
			} else {
				res.writeHead(500);
				res.end(err.toString());
			}
			return;
		}

		if (stat.isDirectory()) {
			serveDirectory(req, res, path, index);
		} else if (stat.isFile()) {
			serveFile(req, res, path, stat);
		} else {
			res.writeHead(500);
			res.end("Invalid path requested");
		}
	});
}
