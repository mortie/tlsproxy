# tlsproxy

tlsproxy is mainly a reverse proxy server, meant to be the process listening to
port 80, 443, etc, and forwarding the requests to internal ports. It also
features automatic HTTPS certificates using letsencrypt.

## Usage

First, install tlsproxy:

	sudo npm install -g tlsproxy

Next step is to create the necessary files in `/etc/tlsproxy` and install systemd
unit files. That's just one command:

	sudo tlsproxy setup

If you're not using systemd, you'll have to find a way to start tlsproxy on boot
yourself.

Next, edit `/etc/tlsproxy/conf.json`. The `email` field is the email used for
letsencrypt certificates. The `user` and `group` fields are the default user
and group for running processes.

If you leave `user` and `group` as `www-data` in the conf file, you may have to
create the user and group `www-data` if it doesn't exist already.

## Configuration

Configuration is done with json files in `/etc/tlsproxy/sites`. All files there
are automatically sourced. The root of a file could either be an object, or it
could be an array containing multiple site objects.

### Example

Here's an example of a proxy for a site served using https, which works both
with and without www, with a redirect from http to https.
It assumes that there's already an http server running on port 8085 which
serves the actual website.

https will magically work and be updated whenever necessary and everything,
just because we used `https` in the host field.

	[
		{
			"host": ["https://example.com", "https://www.example.com"],
			"action": {
				"type": "proxy",
				"to": "http://localhost:8085"
			}
		},
		{
			"host": ["http://example.com", "http://www.example.com"],
			"action": {
				"type": "redirect",
				"to": "https://$host/$path"
			}
		}
	]

### Other Example

Here's an example of just serving files in a directory.

	{
		"host": "https://static.example.com",
		"action": {
			"type": "serve",
			"path": "/var/www/static.example.com/public"
		}
	}

### Properties

Here's a list of the properties a site object can have.

* `host`:
	* The host(s) the site will be available from.
	* If an array is provided, all values will be treated as aliases.
	* A host should look like this: `https://foo.example.com`.
	* Both `http://` and `https://` are accepted.
	* Adding a port is optional, and is done by adding `:<port>` to the end.
	* If no port is provided, 80 will be used for http, and 443 for https.
* `action`:
	* The action to be performed when someone requests the site.
	* `type`: Can be either "proxy" or "redirect".
	* `to`: (if `type` is "redirect" or "proxy"):
		* The host to proxy/redirect to.
	* `path`: (if `type` is "serve"):
		* The path to serve files in.
	* `code` (if `type` is "redirect"):
		* The status code to be sent to the client.
		* Defaults to 302 (temporary redirect).
* `exec`:
	* Execute a process, to let tlsproxy start the servers it's a proxy
	  for if that's desired.
	* The process is automatically restarted if it dies, unless it dies
	  immediately after being started multiple times.
	* `at`: The directory to run the process in.
	* `run`: The command to be executed, interpreted by `/bin/sh`.
	* `group`:
		* The group to execute the process as.
		* Defaults to `group` in `/etc/tlsproxy/conf.json`.
	* `user`:
		* The user to execute the process as.
		* Defaults to `user` in `/etc/tlsproxy/conf.json`.
