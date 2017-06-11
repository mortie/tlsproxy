var WSServer = require("ws").Server;
var WSClient = require("ws");

// Some codes are reserved, so we need to translate them
// into something else
function translateCode(code) {
	if (code === 1004 || code === 1005 || code === 1006)
		return 1000;
	else
		return code;
}

function onWSSocket(wsdomains, sock) {
	var req = sock.upgradeReq;
	if (typeof req.headers.host !== "string") {
		console.log("Received websocket request with no host header.");
		return;
	}

	var domain = req.headers.host.split(":")[0];
	var action = wsdomains[domain];

	if (action === undefined)
		return console.log("Unknown websocket host: "+domain);

	var psockQueue = [];
	var psockClosed = false;
	var sockClosed = false;
	var psock = new WSClient(action.websocket);

	// Send messages, or queue them up
	sock.on("message", msg => {
		if (psock.readyState === 1) {
			psock.send(msg);
		} else {
			psockQueue.push(msg);
		}
	});
	psock.on("open", () => {
		psockQueue.forEach(msg => psock.send(msg));
		psockQueue = null;
	});

	psock.on("message", msg => {
		sock.send(msg);
	});

	// Close one socket when the other one closes
	sock.on("close", (code, msg) => {
		sockClosed = true;
		if (!psockClosed)
			psock.close(translateCode(code), msg);
	});
	psock.on("close", (code, msg) => {
		psockClosed = true;
		if (!sockClosed)
			sock.close(translateCode(code), msg);
	});

	// Catch errors
	sock.on("error", err => {
		console.log("websocket proxy:", err.code);
	});
	psock.on("error", err => {
		if (err.code !== "ECONNRESET")
			console.log("websocket proxy:", err.code);
	});
}

module.exports = function(wsdomains, server) {
	var self = {};

	var wssrv = new WSServer({ server: server });
	wssrv.on("connection", function(sock) {
		onWSSocket(wsdomains, sock);
	});

	return self;
}
