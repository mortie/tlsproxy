var parseUrl = require("../parse-url");

module.exports = function(req, res, action) {
	if (action.to === undefined) {
		res.writeHead(500);
		return res.end("Option 'to' not provided");
	}

	var code = 302;
	if (action.code)
		code = action.code;

	var to = parseUrl(req, res, action.to);
	res.writeHead(code, {
		"location": to
	});
	res.end("Redirecting to "+to);
}
