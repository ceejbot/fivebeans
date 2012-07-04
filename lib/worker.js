(function() {

var __hasProp = Object.prototype.hasOwnProperty;

var
	beanstalk   = require('./client'),
	events      = require('events'),
	util        = require('util'),
	winston     = require('winston');
                  require("js-yaml");

function createLogger(id, dir)
{
	var logger = new (winston.Logger)({
		transports: [
			new (winston.transports.Console)({ colorize: true, timestamp: true })
		]
	});
	if (dir)
	{
		var fname = dir + '/worker_' + id + '.log';
		logger.add(winston.transports.File, { filename: fname, level: 'info', timestamp: true, colorize: false });
	}
	// logger.exitOnError = false;
	return logger;
}

var FiveBeansWorker = function(options)
{
	this.id = options.id;
	this.host = options.host;
	this.port = options.port;
	this.handlers = options.handlers;
	this.stopped = false;

	this.logger = createLogger(this.id, options.logdir);
	var types = Object.keys(this.handlers);
	for (var i = 0; i < types.length; i++)
		this.handlers[types[i]].logger = this.logger;

	this.client = null;
};
util.inherits(FiveBeansWorker, events.EventEmitter);

FiveBeansWorker.prototype.logInfo = function(message, data)
{
	this.logger.info(this.id+': '+message, data);
};

FiveBeansWorker.prototype.logError = function(message, data)
{
	this.logger.error(this.id+': '+message, data);
};

FiveBeansWorker.prototype.start = function(tubes, ignoreDefault)
{
	var self = this;

	self.on('next', function()
	{
		return self.doNext();
	});

	var finishedStarting = function()
	{
		self.logInfo('worker started');
		return self.emit('next');
	};

	self.client = new beanstalk.FiveBeansClient(this.host, this.port);
	self.client.connect(function(err, connection)
	{
		if (err)
			self.logError('error connecting to beanstalkd: '+err);
		else
		{
			self.logInfo('connected to beanstalkd at '+self.host+':'+self.port);
			self.watch(tubes, function()
			{
				if (ignoreDefault)
				{
					self.ignore(['default'], function()
					{
						finishedStarting();
					});
				}
				else
					finishedStarting();
			});
		}
	});
};

FiveBeansWorker.prototype.watch = function(tubes, callback)
{
	var self = this;
	var tube;
	if (tubes && (tube = tubes[0]))
	{
		self.logInfo('watching tube '+tube);
		self.client.watch(tube, function(err)
		{
			if (err) self.logError('error watching tube '+tube, err);
			self.watch(tubes.slice(1), callback);
		});
	}
	else
		callback();
};

FiveBeansWorker.prototype.ignore = function(tubes, callback)
{
	var self = this;
	var tube;
	if (tubes && (tube = tubes[0]))
	{
		self.logInfo('ignoring tube '+tube);
		self.client.ignore(tube, function(err)
		{
			if (err) self.logError('error ignoring tube '+tube, err);
			self.ignore(tubes.slice(1), callback);
		});
	}
	else
		callback();
};

FiveBeansWorker.prototype.stop = function()
{
	this.logInfo('stopping...');
	this.stopped = true;
};

FiveBeansWorker.prototype.doNext = function()
{
	var self = this;
	if (self.stopped)
	{
		self.client.end();
		self.logInfo('stopped.');
		self.emit('stopped');
		return;
	}
	self.client.reserve_with_timeout(4, function(err, jobID, payload)
	{
		if (err)
		{
			if ('TIMED_OUT' === err)
				self.emit('next');
			else
				self.logError('error reserving job', err);
		}
		else
		{
			var job = null;
			try { job = JSON.parse(payload); }
			catch (e) { self.logError('error parsing JSON for job '+jobID, e); }
			if (!job)
				self.buryAndMoveOn(jobID);
			if (job instanceof Array)
				self.runJob(jobID, job[1]);
			else
				self.runJob(jobID, job);
		}
	});
};

FiveBeansWorker.prototype.runJob = function(jobID, job)
{
	var self = this;
	var handler = this.lookupHandler(job.type);
	if (job.type === undefined)
	{
		self.logError('job id '+jobID+' has type '+job.type+'; deleting');
		self.deleteAndMoveOn(jobID);
	}
	else if (!handler)
	{
		self.logError('no handler for job id '+jobID+' with type '+job.type);
		// self.logError(JSON.stringify(job));
		self.buryAndMoveOn(jobID);
	}
	else
	{
		self.callHandler(handler, jobID, job.payload);
	}
};

// synchronous
FiveBeansWorker.prototype.lookupHandler = function(type)
{
	return this.handlers[type];
};

FiveBeansWorker.prototype.callHandler = function(handler, jobID, jobdata)
{
	var self = this;
	var start = new Date().getTime();
	try
	{
		var canceled = false;
		handler.work(jobdata, function(action, delay)
		{
			var elapsed = new Date().getTime() - start;
			switch (action)
			{
				case 'success':
					self.logInfo('ran job '+jobID+' in '+elapsed+' ms'+': '+JSON.stringify(jobdata));
					self.deleteAndMoveOn(jobID);
					break;

				case 'release':
					self.logInfo('released job '+jobID+' after '+elapsed+' ms');
					self.releaseAndMoveOn(jobID, delay);
					break;

				case 'bury':
					self.logInfo('buried job '+jobID);
					self.buryAndMoveOn(jobID);
					break;

				default:
					self.logError('job '+jobID+' failed; reason: '+action+': '+JSON.stringify(jobdata));
					self.buryAndMoveOn(jobID);
					break;
			}
		});
	}
	catch (e)
	{
		self.logError('caught exception running handler for job '+jobID+': '+e);
		self.buryAndMoveOn(jobID);
	}
};

FiveBeansWorker.prototype.buryAndMoveOn = function(jobID)
{
	var self = this;
	self.client.bury(jobID, beanstalk.LOWEST_PRIORITY, function(err)
	{
		if (err) self.logError('error burying job '+jobID+': '+JSON.stringify(err));
		self.emit('next');
	});
};

FiveBeansWorker.prototype.releaseAndMoveOn = function(jobID, delay)
{
	var self = this;
	if (delay === null)
		delay = 30;
	self.client.release(jobID, beanstalk.LOWEST_PRIORITY, delay, function(err)
	{
		if (err) self.logError('error releasing job '+jobID+': '+JSON.stringify(err));
		self.emit('next');
	});
};

FiveBeansWorker.prototype.deleteAndMoveOn = function(jobID)
{
	var self = this;
	self.client.destroy(jobID, function(err)
	{
		if (err) self.logError('error deleting job '+jobID+': '+JSON.stringify(err));
		self.emit('next');
	});
};

exports.FiveBeansWorker = FiveBeansWorker;

}).call(this);
