var
	beanstalk   = require('./client'),
	events      = require('events'),
	util        = require('util'),
	yaml        = require('js-yaml')
	;

/*
Events emitted:

error: payload is error; execution is halted
warning: payload is object with error information; execution continues
started: no payload
stopped: no payload
info: payload is object with action info
close: no payload

job.reserved: job has been reserved; payload is job id
job.handled: payload is object with job info
job.deleted: payload is jobid
job.destroyed: payload is jobid
job.buried: payload is jobid

*/

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

FiveBeansWorker.prototype.emitInfo = function(message, data)
{
	this.emit('info',
	{
		clientid: this.id,
		message:  message,
		data:     data
	});
	// console.log(message, data);
};

FiveBeansWorker.prototype.emitWarning = function(data)
{
	data.clientid = this.id;
	this.emit('warning', data);
};

FiveBeansWorker.prototype.start = function(tubes)
{
	var self = this;
	this.stopped = false;

	this.on('next', this.doNext.bind(this));

	function finishedStarting()
	{
		self.emit('started');
		self.emit('next');
	}

	this.client = new beanstalk(this.host, this.port);

	this.client.on('connect', function()
	{
		self.emitInfo('connected to beanstalkd at '+ self.host + ':'+self.port);
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
		self.emitWarning({message: 'beanstalkd connection error', error: err});
		self.emit('error', err);
	});

	this.client.on('close', function()
	{
		self.emitInfo('beanstalkd connection closed');
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
		self.emitInfo('watching tube ' + tube);
		self.client.watch(tube, function(err)
		{
			if (err) self.emitWarning({ message: 'error watching tube', tube: tube, error: err });
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
		self.emitInfo('ignoring tube '+tube);
		self.client.ignore(tube, function(err)
		{
			if (err) self.emitWarning({ message: 'error ignoring tube', tube: tube, error: err });
			self.ignore(tubes.slice(1), callback);
		});
	}
	else
		callback();
};

FiveBeansWorker.prototype.stop = function()
{
	this.emitInfo('stopping...');
	this.stopped = true;
};

FiveBeansWorker.prototype.doNext = function()
{
	var self = this;
	if (self.stopped)
	{
		self.client.end();
		self.emitInfo('stopped');
		self.emit('stopped');
		return;
	}

	self.client.reserve_with_timeout(1, function(err, jobID, payload)
	{
		if (err)
		{
			if ('TIMED_OUT' === err)
				self.emit('next');
			else
				self.emitWarning({ message: 'error reserving job', error: err });
		}
		else
		{
			self.emit('job.reserved', jobID);
			self.emit('info', { message: 'job reserved', id: jobID });

			var job = null;
			try { job = JSON.parse(payload); }
			catch (e) { self.emitWarning({ message: 'parsing job JSON', id: jobID, error: e }); }
			if (!job || (typeof job !== 'object'))
				self.buryAndMoveOn(jobID);
			else if (job instanceof Array)
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
		self.emitWarning({ message: 'no job type', id: jobID, job: job });
		self.deleteAndMoveOn(jobID);
	}
	else if (!handler)
	{
		self.emitWarning({ message: 'no handler found', id: jobID, type: job.type });
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

			// TODO refactor
			self.emit('job.handled', { id: jobID, type: handler.type, elapsed: elapsed, action: action });
			self.emit('info', { message: 'job handled', id: jobID, type: handler.type, elapsed: elapsed, action: action });

			switch (action)
			{
			case 'success':
				self.deleteAndMoveOn(jobID);
				break;

			case 'release':
				self.releaseAndMoveOn(jobID, delay);
				break;

			case 'bury':
				self.buryAndMoveOn(jobID);
				break;

			default:
				self.buryAndMoveOn(jobID);
				break;
			}
		});
	}
	catch (e)
	{
		self.emitWarning({ message: 'exception in job handler', id: jobID, handler: handler.type, error: e });
		self.buryAndMoveOn(jobID);
	}
};

FiveBeansWorker.prototype.buryAndMoveOn = function(jobID)
{
	var self = this;
	self.client.bury(jobID, beanstalk.LOWEST_PRIORITY, function(err)
	{
		if (err) self.emitWarning({ message: 'error burying', id: jobID, error: err });
		self.emit('job.buried', jobID);
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
		if (err) self.emitWarning({ message: 'error releasing', id: jobID, error: err });
		self.emit('job.released', jobID);
		self.emit('next');
	});
};

FiveBeansWorker.prototype.deleteAndMoveOn = function(jobID)
{
	var self = this;
	self.client.destroy(jobID, function(err)
	{
		if (err) self.emitWarning({ message: 'error deleting', id: jobID, error: err });
		self.emit('job.deleted', jobID);
		self.emit('next');
	});
};

module.exports = FiveBeansWorker;
