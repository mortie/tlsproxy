var pathlib = require("path");

var lexes = {};

exports.register = register;
exports.getCallback = getCallback;

function register(domain) {
	var lex = Lex.create({
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

function getCallback(domain) {
	return lexes[domain].httpsOptions.SNICallback;
}
