var
	_               = require('lodash'),
	assert          = require('assert'),
	fs              = require('fs'),
	yaml            = require('js-yaml'),
	FiveBeansWorker = require('./worker')
	;

var FiveBeansRunner = function(id, configpath, config)
{
	assert(id);
	assert(configpath || config);

	this.id = id;
	this.configpath = null;
	this.config = null;

	if (configpath) {
		if (configpath[0] !== '/') {
			configpath = process.cwd() + '/' + configpath;
		}

		this.configpath = configpath;
		if (!fs.existsSync(configpath)) {
			throw(new Error(configpath + ' does not exist'));
		}
	} else if (config) {
		this.config = config;
	} else {
		throw new Error('invalid configuration');
	}

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
	var config = null;
	var fname = this.configpath;

	if (this.config) {
		config = this.config;
	} else {
		// read config file
		try {
			config = yaml.safeLoad(fs.readFileSync(fname, 'utf8'));
		}
		catch(err) {
			throw err;
		}
	}

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
	var options =
	{
		id: this.id,
		host: config.beanstalkd.host,
		port: config.beanstalkd.port,
		handlers: config.handlers,
		ignoreDefault: config.ignoreDefault
	};

	var worker = new FiveBeansWorker(options);
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
