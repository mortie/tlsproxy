var pathlib = require("path");
var Lex = require("letsencrypt-express");

var acmePath = "/tmp/acme-challenge";
var server;

var lexes = {};

exports.register = register;
exports.sniCallback = sniCallback;
exports.acmeResponder = acmeResponder;

function register(conf, domain) {
	if (conf.testing)
		server = "https://acme-v01.api.letsencrypt.org/directory";
	else
		server = "staging";

	var configDir = pathlib.join(conf.confpath, "letsencrypt");
	if (conf.testing)
		configDir += "-testing";

	var lex = Lex.create({
		configDir: configDir,

		server: server,

		challenges: {
			"http-01": require("le-challenge-fs").create({
				webrootPath: acmePath
			})
		},

		store: require("le-store-certbot").create({
			webrootPath: acmePath
		}),

		approveDomains: function(opts, certs, cb) {
			if (certs) {
				opts.domains = certs.altnames;
			} else {
				opts.email = conf.email;
				opts.agreeTos = true;
			}

			if (opts.domain === domain) {
				cb(null, {
					options: opts,
					certs: certs
				});
			} else {
				cb("Domain "+domain+" doesn't match!");
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
