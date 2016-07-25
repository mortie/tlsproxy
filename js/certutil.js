var pathlib = require("path");
var Lex = require("letsencrypt-express");

var acmePath = "/.well-known/acme-challenge";

var lexes = {};

exports.register = register;
exports.sniCallback = sniCallback;
exports.acmeResponder = acmeResponder;

function register(conf, domain) {
	var lex = Lex.create({
		webrootPath: acmePath,
		configDir: pathlib.join(conf.confpath, "letsencrypt"),
		approveRegistration: (hostname, approve) => {
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

var acmeResponders = {};

function acmeResponder(cb) {
	return function(req, res) {
		if (req.url.indexOf(acmePath) === 0) {
			var domain = req.headers.host;
			var responder = acmeResponders[domain];
			if (!responder) {
				responder = Lex.createAcmeResponder(lexes[domain], function() {});
				acmeResponders[domain] = responder;
			}

			responder(req, res);
		} else {
			cb(req, res);
		}
	}
}
