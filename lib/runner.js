(function() {

var fs   = require('fs'),
	yaml = require('js-yaml');

var FiveBeansWorker = require('./worker').FiveBeansWorker;

var FiveBeansRunner = function(id, configpath)
{
	this.id = id;
	if (configpath[0] !== '/')
		configpath = process.cwd() + '/' + configpath;
	this.configpath = configpath;
	this.worker = null;
	return this;
};

FiveBeansRunner.prototype.go = function()
{
	var self = this;

	self.worker = self.createWorker();

	process.on('SIGINT', function() { self.handleStop(); });
	process.on('SIGQUIT', function() { self.handleStop(); });
	process.on('SIGHUP', function() { self.handleStop(); });

	process.on('SIGUSR2', function()
	{
		self.worker.on('stopped', function()
		{
			self.worker = self.createWorker();
		});
		self.worker.logInfo('received SIGUSR2; stopping & reloading configuration');
		self.worker.stop();
	});

	return self;
};

function readConfiguration(fname)
{
	var config = require(fname)[0];
	var dirprefix = process.cwd() + '/';
	var i, h, func;

	var handlers = {};
	for (var i=0, len=config.handlers.length; i < len; i++)
	{
		h = require(dirprefix + config.handlers[i])();
		handlers[h.type] = h;
	}
	config.handlers = handlers;

	return config;
}

FiveBeansRunner.prototype.createWorker = function()
{
	var config = readConfiguration(this.configpath);
	var options = {
		id: this.id,
		host: config.beanstalkd.host,
		port: config.beanstalkd.port,
		logdir: config.logdir,
		handlers: config.handlers
	};

	var worker = new FiveBeansWorker(options);
	worker.start(config.watch, config.ignoreDefault);
	return worker;
};

FiveBeansRunner.prototype.handleStop = function()
{
	this.worker.on('stopped', function()
	{
		process.exit(0);
	});
	this.worker.stop();
};

exports.FiveBeansRunner = FiveBeansRunner;

}).call(this);
