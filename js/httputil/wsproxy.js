var WSServer = require("ws").Server;
var WSClient = require("ws");

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

	var sockQueue = [];
	var psockQueue = [];
	var sockOpened = false;
	var psockOpened = false;
	var sockClosed = false;
	var psockClosed = false;

	var psock = new WSClient(action.websocket);

	// Send messages, or queue them up
	sock.on("message", msg => {
		if (psock.readyState === 1) {
			if (!psockOpened) {
				psockQueue.forEach(m => psock.send(m));
				psockQueue = null;
				psockOpened = true;
			}
			psock.send(msg);
		} else if (!psockOpened) {
			psockQueue.push(msg);
		}
	});
	psock.on("message", msg => {
		if (sock.readyState === 1) {
			if (!sockOpened) {
				sockQueue.forEach(m => sock.send(m));
				sockQuee = null;
				sockOpened = true;
			}
			sock.send(msg);
		} else if (!sockOpened) {
			sockQueue.push(msg);
		}
	});

	// Close one socket when the other one closes
	sock.on("close", (code, msg) => {
		sockClosed = true;
		if (!psockClosed)
			psock.close(code, msg);
	});
	psock.on("close", (code, msg) => {
		psockClosed = true;
		if (!psockClosed)
			sock.close(code, msg);
	});

	// Catch errors
	sock.on("error", err => {
		console.trace(err);
	});
	psock.on("error", err => {
		console.trace(err);
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
