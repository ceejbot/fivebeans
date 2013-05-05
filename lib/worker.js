var
	beanstalk   = require('./client'),
	events      = require('events'),
	util        = require('util'),
	yaml        = require('js-yaml')
	;

var FiveBeansWorker = function(options)
{
	events.EventEmitter.call(this);

	this.id            = options.id;
	this.host          = options.host;
	this.port          = options.port;
	this.handlers      = options.handlers;
	this.ignoreDefault = options.ignoreDefault;
	this.stopped       = false;

	this.client = null;
};
util.inherits(FiveBeansWorker, events.EventEmitter);

FiveBeansWorker.prototype.emitInfoLog = function(message, data)
{
	this.emit('log',
	{
		level:    'info',
		clientid: this.id,
		message:  message,
		data:     data
	});
	//console.log(message, data);
};

FiveBeansWorker.prototype.emitErrorLog = function(message, data)
{
	this.emit('log',
	{
		level:    'error',
		clientid: this.id,
		message:  message,
		data:     data
	});
	//console.error(message, data);
};

FiveBeansWorker.prototype.start = function(tubes)
{
	var self = this;

	this.on('next', this.doNext.bind(this));

	function finishedStarting()
	{
		self.emit('started');
		self.emit('next');
	}

	this.client = new beanstalk(this.host, this.port);

	this.client.on('connect', function()
	{
		self.emitInfoLog('connected to beanstalkd at '+ self.host + ':'+self.port);
		self.watch(tubes, function()
		{
			if (tubes && tubes.length && self.ignoreDefault)
			{
				self.ignore(['default'], function()
				{
					finishedStarting();
				});
			}
			else
			{
				finishedStarting();
			}
		});
	});

	this.client.on('error', function(err)
	{
		self.emitErrorLog('beanstalkd connection error', err);
		self.emit('error', err);
	});

	this.client.on('close', function()
	{
		self.emitInfoLog('beanstalkd connection closed');
		self.emit('close');
	});

	this.client.connect();
};

FiveBeansWorker.prototype.watch = function(tubes, callback)
{
	var self = this;
	var tube;
	if (tubes && (tube = tubes[0]))
	{
		self.emitInfoLog('watching tube ' + tube);
		self.client.watch(tube, function(err)
		{
			if (err) self.emitErrorLog('error watching tube '+tube, err);
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
		self.emitInfoLog('ignoring tube '+tube);
		self.client.ignore(tube, function(err)
		{
			if (err) self.emitErrorLog('error ignoring tube '+tube, err);
			self.ignore(tubes.slice(1), callback);
		});
	}
	else
		callback();
};

FiveBeansWorker.prototype.stop = function()
{
	this.emitInfoLog('stopping...');
	this.stopped = true;
};

FiveBeansWorker.prototype.doNext = function()
{
	var self = this;
	if (self.stopped)
	{
		self.client.end();
		self.emitInfoLog('stopped');
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
				self.emitErrorLog('error reserving job', err);
		}
		else
		{
			var job = null;
			try { job = JSON.parse(payload); }
			catch (e) { self.emitErrorLog('error parsing JSON for job ' + jobID, e); }
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
		self.emitErrorLog('job id ' + jobID + ' has type ' + job.type + '; deleting');
		self.deleteAndMoveOn(jobID);
	}
	else if (!handler)
	{
		self.emitErrorLog('no handler for job id ' + jobID + ' with type ' + job.type);
		// self.emitErrorLog(JSON.stringify(job));
		self.buryAndMoveOn(jobID);
	}
	else
	{
		self.callHandler(handler, jobID, job.payload);
	}
};

FiveBeansWorker.prototype.lookupHandler = function(type)
{
	return this.handlers[type];
};

FiveBeansWorker.prototype.callHandler = function(handler, jobID, jobdata)
{
	var self = this;
	var start = new Date().getTime();
	this.currentJob = jobID;
	this.currentHandler = handler;

	try
	{
		handler.work(jobdata, function(action, delay)
		{
			var elapsed = new Date().getTime() - start;
			switch (action)
			{
			case 'success':
				self.emitInfoLog('ran job '+ jobID + ' in '+elapsed+' ms'+': '+JSON.stringify(jobdata));
				self.deleteAndMoveOn(jobID);
				break;

			case 'release':
				self.emitInfoLog('released job '+ jobID + ' after '+elapsed+' ms');
				self.releaseAndMoveOn(jobID, delay);
				break;

			case 'bury':
				self.emitInfoLog('buried job ' + jobID);
				self.buryAndMoveOn(jobID);
				break;

			default:
				self.emitErrorLog('job ' + jobID + ' failed; reason: '+action+': '+JSON.stringify(jobdata));
				self.buryAndMoveOn(jobID);
				break;
			}
		});
	}
	catch (e)
	{
		self.emitErrorLog('caught exception running handler for job ' + jobID + ': '+e);
		self.buryAndMoveOn(jobID);
	}
};

FiveBeansWorker.prototype.buryAndMoveOn = function(jobID)
{
	var self = this;
	self.client.bury(jobID, beanstalk.LOWEST_PRIORITY, function(err)
	{
		if (err) self.emitErrorLog('error burying job ' + jobID + ': '+JSON.stringify(err));
		self.emit('next');
	});
};

FiveBeansWorker.prototype.releaseAndMoveOn = function(jobID, delay)
{
	var self = this;
	if (!delay)
		delay = 30;

	self.client.release(jobID, beanstalk.LOWEST_PRIORITY, delay, function(err)
	{
		if (err) self.emitErrorLog('error releasing job ' + jobID + ': '+JSON.stringify(err));
		self.emit('next');
	});
};

FiveBeansWorker.prototype.deleteAndMoveOn = function(jobID)
{
	var self = this;
	self.client.destroy(jobID, function(err)
	{
		if (err) self.emitErrorLog('error deleting job ' + jobID + ': '+JSON.stringify(err));
		self.emit('next');
	});
};

module.exports = FiveBeansWorker;
