(function() {

var net = require('net');
var yaml = require('js-yaml');

var DEFAULT_HOST = '127.0.0.1';
var DEFAULT_PORT =  11300;
var LOWEST_PRIORITY = 1000;

// utilities
// Javascript lacks a hash keys() method.
function hashKeys(hash)
{
	var keys = [];
	for (var k in hash) if (hash.hasOwnProperty(k)) keys.push(k);
	return keys;
}

// Turn a function argument hash into an array for slicing.
function argHashToArray(hash)
{
	var keys = hashKeys(hash);
	var result = [];
	for (var i=0; i<keys.length; i++)
	{
		result[parseInt(keys[i], 10)] = hash[keys[i]];
	}
	return result;
}

var FiveBeansClient = function(host, port)
{
	this.stream = null;
	this.handlers = [];
	this.buffer = undefined;

	this.host = (host === undefined) ? DEFAULT_HOST : host;
	this.port = (port === undefined) ? DEFAULT_PORT : port;
};

FiveBeansClient.prototype.connect = function(callback)
{
	var self = this, tmp;

	self.stream = net.createConnection(self.port, self.host);

	self.stream.on('data', function(data)
	{
		if (!self.buffer)
			self.buffer = data;
		else
		{
			tmp = new Buffer(self.buffer.length + data.length);
			self.buffer.copy(tmp, 0);
			data.copy(tmp, self.buffer.length);
			self.buffer = tmp;
		}
		return self.tryHandlingResponse();
	});
	self.stream.on('connect', function()
	{
		callback(null);
	});
	self.stream.on('error', function(err)
	{
		callback(err);
	});
	self.stream.on('close', function(err)
	{
		callback(err);
	});
};

FiveBeansClient.prototype.end = function()
{
	if (this.stream)
		this.stream.end();
};

FiveBeansClient.prototype.tryHandlingResponse = function()
{
	// Peek at the oldest handler in our list and see if if thinks it's done.
	var latest = this.handlers[0];
	var handler = latest[0];
	var callback = latest[1];

	if ((handler !== undefined) && (handler !== null))
	{
		handler.process(this.buffer);
		if (handler.complete)
		{
			// shift it off & reset
			this.handlers.shift();
			this.buffer = undefined;
			if (handler.success)
				callback.call.apply(callback, [null, null].concat(handler.args));
			else
				callback.call(null, handler.args[0]);
		}
		else
			handler.reset();
	}
};

FiveBeansClient.prototype.send = function()
{
	var arglist = argHashToArray(arguments);
	this.stream.write(arglist.join(' ') + '\r\n');
};

// response handlers

var ResponseHandler = function(expectedResponse)
{
	this.expectedResponse = expectedResponse;
	return this;
};

ResponseHandler.prototype.reset = function()
{
	this.complete = false;
	this.success = false;
	this.args = undefined;
	this.header = undefined;
	this.body = undefined;
};

ResponseHandler.prototype.RESPONSES_REQUIRING_BODY =
{
	'RESERVED': 'passthrough',
	'FOUND': 'passthrough',
	'OK': 'yaml'
};

function findInBuffer(buffer, bytes)
{
	var ptr = 0, idx = 0;
	while (ptr < buffer.length)
	{
		if (buffer[ptr] === bytes[idx])
		{
			idx++;
			if (idx === bytes.length)
				return (ptr - bytes.length + 1);
		}
		else
			idx = 0;
		ptr++;
	}
	return -1;
}

var CRLF = new Buffer([0x0d, 0x0a]);

ResponseHandler.prototype.process = function(data)
{
	var eol = findInBuffer(data, CRLF);
	if (eol > -1)
	{
		// Header is everything up to the windows line break;
		// body is everything after.
		this.header = data.toString('utf8', 0, eol);
		this.body = data.slice(eol + 2, data.length);
		this.args = this.header.split(' ');

		var response = this.args[0];
		if (response === this.expectedResponse)
		{
			this.success = true;
			this.args.shift(); // remove it as redundant
		}
		if (this.RESPONSES_REQUIRING_BODY[response])
			this.parseBody(this.RESPONSES_REQUIRING_BODY[response]);
		else
			this.complete = true;
	}
};

/*
RESERVED <id> <bytes>\r\n
<data>\r\n

OK <bytes>\r\n
<data>\r\n

Beanstalkd commands like reserve() & stats() return a body.
We must read <bytes> data in response.
*/
ResponseHandler.prototype.parseBody = function(how)
{
	if ((this.body === undefined) || (this.body === null))
		return;

	var expectedLength = parseInt(this.args[this.args.length - 1], 10);
	if (this.body.length === (expectedLength + 2))
	{
		this.args.pop();
		var body = this.body.slice(0, expectedLength);
		this.complete = true;

		switch(how)
		{
			case 'yaml':
				this.args.push(yaml.load(body));
				break;

			case 'passthrough':
			default:
				this.args.push(body);
				break;
		}
	}
};

// Implementing the beanstalkd interface.

function makeBeanstalkCommand(command, expectedResponse, sendsData)
{
	// Commands are called as client.COMMAND(arg1, arg2, ... data, callback);
	// They're sent to beanstalkd as: COMMAND arg1 arg2 ...
	// followed by data.
	// So we slice the callback & data from the passed-in arguments, prepend
	// the command, then send the arglist otherwise intact.
	// We then push a handler for the expected response onto our handler stack.
	// Some commands have no args, just a callback (stats, stats-tube, etc);
	// That's the case handled when args < 2.
	return function()
	{
		var data, datalen, encoding;
		var args = argHashToArray(arguments);
		var callback = args.pop();
		args.unshift(command);

		if (sendsData)
		{
			data = args.pop();
			if (typeof data === 'string')
			{
				encoding = 'utf8';
				datalen = Buffer.byteLength(data);
			}
			else
			{
				encoding = 'binary';
				datalen = data.length;
			}
			args.push(datalen);
		}

		this.send.apply(this, args);
		if (data)
		{
			encoding = (typeof data === 'string') ? 'utf8' : 'binary';
			this.stream.write(data);
			this.stream.write('\r\n');
		}

		this.handlers.push([new ResponseHandler(expectedResponse), callback]);
	};
}

// beanstalkd commands

FiveBeansClient.prototype.use = makeBeanstalkCommand('use', 'USING');
FiveBeansClient.prototype.put = makeBeanstalkCommand('put', 'INSERTED', true);

FiveBeansClient.prototype.watch = makeBeanstalkCommand('watch', 'WATCHING');
FiveBeansClient.prototype.ignore = makeBeanstalkCommand('ignore', 'WATCHING');
FiveBeansClient.prototype.reserve = makeBeanstalkCommand('reserve', 'RESERVED');
FiveBeansClient.prototype.reserve_with_timeout = makeBeanstalkCommand('reserve-with-timeout', 'RESERVED');
FiveBeansClient.prototype.destroy = makeBeanstalkCommand('delete', 'DELETED');
FiveBeansClient.prototype.release = makeBeanstalkCommand('release', 'RELEASED');
FiveBeansClient.prototype.bury = makeBeanstalkCommand('bury', 'BURIED');
FiveBeansClient.prototype.touch = makeBeanstalkCommand('touch', 'TOUCHED');
FiveBeansClient.prototype.kick = makeBeanstalkCommand('kick', 'KICKED');

FiveBeansClient.prototype.peek = makeBeanstalkCommand('peek', 'FOUND');
FiveBeansClient.prototype.peek_ready = makeBeanstalkCommand('peek-ready', 'FOUND');
FiveBeansClient.prototype.peek_delayed = makeBeanstalkCommand('peek-delayed', 'FOUND');
FiveBeansClient.prototype.peek_buried = makeBeanstalkCommand('peek-buried', 'FOUND');

FiveBeansClient.prototype.list_tube_used = makeBeanstalkCommand('list-tube-used', 'USING');
FiveBeansClient.prototype.pause_tube = makeBeanstalkCommand('pause-tube', 'PAUSED');

// the server returns yaml files in response to these commands
FiveBeansClient.prototype.list_tubes = makeBeanstalkCommand('list-tubes', 'OK');
FiveBeansClient.prototype.list_tubes_watched = makeBeanstalkCommand('list-tubes-watched', 'OK');
FiveBeansClient.prototype.stats_job = makeBeanstalkCommand('stats-job', 'OK');
FiveBeansClient.prototype.stats_tube = makeBeanstalkCommand('stats-tube', 'OK');
FiveBeansClient.prototype.stats = makeBeanstalkCommand('stats', 'OK');

// TODO quit -- closes connection, no response

// end beanstalkd commands

exports.FiveBeansClient = FiveBeansClient;
exports.LOWEST_PRIORITY = LOWEST_PRIORITY;

}).call(this);
