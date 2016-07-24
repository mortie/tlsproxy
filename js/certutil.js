var pathlib = require("path");
var Lex = require("letsencrypt-express");

var acmePath = "/tmp/.well_known/acme-challenge";

var lexes = {};

exports.register = register;
exports.sniCallback = sniCallback;
exports.acmeResponder = acmeResponder;

function register(conf, domain) {
	var lex = Lex.create({
		webrootPath: acmePath,
		configDir: pathlib.join(conf.conf_dir, "letsencrypt"),
		approveRegistration: function(hostname, approve) {
			if (hostname === domain) {
				approve(null, {
					domains: [domain],
					email: conf.email,
					agreeTos: true
				});
			}
		}
	});

	lexes[domain] = lex;
}

function sniCallback(domain, cb) {
	if (lexes[domain] && lexes[domain].httpsOptions)
		lexes[domain].httpsOptions.SNICallback(domain, cb);
	else
		cb(true);
}

function acmeResponder(cb) {
	return function(req, res) {
		console.log(req.host, req.url);
	}
}
