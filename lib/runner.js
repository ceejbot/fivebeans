var
	_               = require('lodash'),
	assert          = require('assert'),
	fs              = require('fs'),
	yaml            = require('js-yaml'),
	FiveBeansWorker = require('./worker')
	;

var FiveBeansRunner = function(id, configpath)
{
	assert(id);
	assert(configpath);

	this.id = id;
	if (configpath[0] !== '/')
		configpath = process.cwd() + '/' + configpath;
	this.configpath = configpath;

	if (!fs.existsSync(configpath))
		throw(new Error(configpath + ' does not exist'));

	return this;
};

FiveBeansRunner.prototype.go = function()
{
	var self = this;

	this.createWorkers();

	process.on('SIGINT', this.handleStop.bind(this));
	process.on('SIGQUIT', this.handleStop.bind(this));
	process.on('SIGHUP', this.handleStop.bind(this));

	process.on('SIGUSR2', function()
	{
		var done =_.after(self.workers.length, function()
		{
			self.createWorkers();
		});

		_.each(self.workers, function (w)
		{
			w.on('stopped', function ()
			{
				done();
			});
		});

		_.each(self.workers,function (w)
		{
			w.stop();
		});
	});

	return self;
};

FiveBeansRunner.prototype.readConfiguration = function()
{
	var fname = this.configpath;
	var config = yaml.load(fs.readFileSync(fname, 'utf8'));
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

FiveBeansRunner.prototype.createWorkers = function ()
{
	this.workers = [];
        var config = _.extend({}, this.readConfiguration());
        var options =
        {
                id: this.id,
                host: config.beanstalkd.host,
                port: config.beanstalkd.port,
                handlers: config.handlers,
                ignoreDefault: config.ignoreDefault,
		workerPerTube : config.workerPerTube
        };

	if (options.workerPerTube)
	{
		_.each(config.watch, function (watch,i,watches)
		{
			this.workers.push( this.createWorker(options,[ watch ]) );
		},this);
	} else {
		this.workers.push ( this.worker = this.createWorker(options, config.watch) );
	}
}

FiveBeansRunner.prototype.createWorker = function(options,watch)
{
	var worker = new FiveBeansWorker(options);
	worker.start(watch);
	return worker;
};

FiveBeansRunner.prototype.handleStop = function()
{
	var done =_.after(this.workers.length, function()
	{
		process.exit(0);
	});

	_.each(this.workers, function (w)
	{
		w.on('stopped', function ()
		{
			done();
		});
	});

	_.each(this.workers,function (w)
	{
		w.stop();
	});
};

module.exports = FiveBeansRunner;
