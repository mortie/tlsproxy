module.exports = function(req, res, url) {
	return url
		.replace(/\$host/g, req.headers.host)
		.replace(/\$path/g, req.url.substring(1));
}
