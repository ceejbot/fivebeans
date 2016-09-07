var
	_               = require('lodash'),
	assert          = require('assert'),
	fs              = require('fs'),
	yaml            = require('js-yaml'),
	FiveBeansWorker = require('./worker')
	;

var FiveBeansRunner = function(id, config)
{
	assert(id);
	assert(config);

	this.id = id;

	if (typeof config === "string") {
		if (config[0] !== '/')
			config = process.cwd() + '/' + config;
		if (!fs.existsSync(config))
			throw(new Error(config + ' does not exist'));
	} else {
		assert.equal(typeof config, "object");
	}

	this.config = config;

	this.worker = null;
	return this;
};

FiveBeansRunner.prototype.go = function()
{
	var self = this;

	this.worker = this.createWorker();

	process.on('SIGINT', this.handleStop.bind(this));
	process.on('SIGQUIT', this.handleStop.bind(this));
	process.on('SIGHUP', this.handleStop.bind(this));

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

FiveBeansRunner.prototype.readConfiguration = function()
{
	var config = (typeof this.config === "string") ? yaml.load(fs.readFileSync(this.config, 'utf8')) : this.config;
	var dirprefix = process.cwd() + '/';
	var h;

	var handlers = {};
	for (var i = 0, len = config.handlers.length; i < len; i++)
	{
		h = require(dirprefix + config.handlers[i])();
		handlers[h.type] = h;
	}
	config.handlers = handlers;

	return config;
};

FiveBeansRunner.prototype.createWorker = function()
{
	var config = _.extend({}, this.readConfiguration());
	var worker = new FiveBeansWorker(config);

	var logLevel = config.logLevel;
	if (logLevel === 'info')
	{
		worker.on('info', console.log);
		logLevel = 'warning';
	}

	if (logLevel === 'warning')
	{
		worker.on('warning', console.warn);
		logLevel = 'error';
	}

	if (logLevel === 'error')
		worker.on('error', console.error);

	worker.start(config.watch);
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

module.exports = FiveBeansRunner;
