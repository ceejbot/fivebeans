/*global describe:true, it:true, before:true, after:true, beforeEach:true, afterEach:true */

var
	demand    = require('must'),
	events    = require('events'),
	fivebeans = require('../index'),
	fs        = require('fs'),
	util      = require('util')
	;

//-------------------------------------------------------------
// some job handlers for testing

var asyncHandler = require('./fixtures/async')();

function TestHandler()
{
	events.EventEmitter.call(this);
	this.type = 'reverse';
}
util.inherits(TestHandler, events.EventEmitter);

TestHandler.prototype.work = function(payload, callback)
{
	this.emit('result', this.reverseWords(payload));
	callback(payload, 0);
};

TestHandler.prototype.reverseWords = function(input)
{
	var words = input.split(' ');
	words.reverse();
	return words.join('');
};

var joblist =
[
	{ type: 'reverse', payload: 'madam, I\'m Adam' },
	{ type: 'reverse', payload: 'satan oscillate my metallic sonatas' },
	{ type: 'reverse', payload: 'able was I ere I saw Elba' },
];

//-------------------------------------------------------------

var host = '127.0.0.1';
var port = 11300;
var tube = 'testtube';

var testopts =
{
	id: 'testworker',
	host: host,
	port: port,
	ignoreDefault: true,
	handlers:
	{
		reverse: new TestHandler(),
		longasync: asyncHandler,
	},
	timeout: 1
};

//-------------------------------------------------------------

describe('FiveBeansWorker', function()
{
	this.timeout(5000);
	var producer, testjobid;

	before(function(done)
	{
		producer = new fivebeans.client(host, port);
		producer.on('connect', function()
		{
			producer.use(tube, function(err, resp)
			{
				done();
			});
		});
		producer.connect();
	});

	describe('constructor', function()
	{
		it('creates a worker with the passed-in options', function()
		{
			var opts =
			{
				id: 'testworker',
				host: 'example.com',
				port: 3000
			};
			var w = new fivebeans.worker(opts);

			w.id.must.equal(opts.id);
			w.host.must.equal(opts.host);
			w.port.must.equal(opts.port);
		});

		it('inherits from EventEmitter', function()
		{
			var w = new fivebeans.worker({ id: 'testworker' });
			w.must.have.property('on');
			w.on.must.be.a.function();
		});

		it('respects the timeout option', function()
		{
			var opts =
			{
				id: 'testworker',
				host: 'example.com',
				port: 3000,
				timeout: 20
			};
			var w = new fivebeans.worker(opts);
			w.timeout.must.equal(20);
		});
	});

	describe('starting & stopping', function()
	{
		var w;

		it('emits the error event on failure', function(done)
		{
			w = new fivebeans.worker({id: 'fail', port: 5000});
			w.on('error', function(err)
			{
				err.must.exist();
				err.must.have.property('errno');
				err.errno.must.equal('ECONNREFUSED');
				done();
			});
			w.start();
		});

		it('emits the started event on success', function(done)
		{
			w = new fivebeans.worker(testopts);
			w.on('started', function()
			{
				done();
			}).on('error', function(err)
			{
				throw(err);
			});
			w.start();
		});

		it('stops and cleans up when stopped', function(done)
		{
			w.on('stopped', function()
			{
				w.stopped.must.equal(true);
				done();
			});

			w.stop();
		});

		it('watches tubes on start', function(done)
		{
			var worker = new fivebeans.worker(testopts);
			// worker.on('info', function(obj) { console.log(obj); })
			// worker.on('warning', function(obj) { console.error(util.inspect(obj)); })

			function handleStart()
			{
				worker.client.list_tubes_watched(function(err, response)
				{
					demand(err).not.exist();
					response.must.be.an.array();
					response.length.must.equal(2);
					response.indexOf(tube).must.be.above(-1);

					worker.removeListener('started', handleStart);
					worker.stop();
				});
			}

			worker.on('started', handleStart);
			worker.on('stopped', done);
			worker.start([tube, 'unused']);
		});
	});

	describe('job processing', function()
	{
		var worker;

		before(function(done)
		{
			worker = new fivebeans.worker(testopts);
			worker.on('started', done);
			worker.start([tube, 'unused']);
		});

		it('deletes jobs with bad formats', function(done)
		{
			var job = { format: 'bad'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();

				function detectReady()
				{
					producer.peek_ready(function(err, jobid, payload)
					{
						err.must.exist();
						err.must.equal('NOT_FOUND');
						done();
					});
				}

				setTimeout(detectReady, 500);
			});
		});

		it('buries jobs with bad json', function(done)
		{
			function handleBuried(jobid)
			{
				producer.peek_buried(function(err, buriedID, payload)
				{
					worker.removeListener('job.buried', handleBuried);

					demand(err).not.exist();
					buriedID.must.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			}

			worker.on('job.buried', handleBuried);

			producer.put(0, 0, 60, '{ I am invalid JSON', function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('buries jobs for which it has no handler', function(done)
		{
			function handleBuried(jobid)
			{
				producer.peek_buried(function(err, buriedID, payload)
				{
					worker.removeListener('job.buried', handleBuried);

					demand(err).not.exist();
					buriedID.must.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			}

			worker.on('job.buried', handleBuried);
			var job = { type: 'unknown', payload: 'extremely important!'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('passes good jobs to handlers', function(done)
		{
			var handler = testopts.handlers.reverse;

			function verifyResult(item)
			{
				item.must.exist();
				item.must.be.a.string();
				item.must.equal('success');
				handler.removeListener('result', verifyResult);
				done();
			}

			handler.on('result', verifyResult);
			var job = { type: 'reverse', payload: 'success'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('handles jobs that contain arrays (for ruby compatibility)', function(done)
		{
			function detectDeleted(jobid)
			{
				worker.removeListener('job.deleted', detectDeleted);
				done();
			}

			worker.on('job.deleted', detectDeleted);

			var job = ['stalker', { type: 'reverse', payload: 'success'}];
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('buries jobs when the handler responds with "bury"', function(done)
		{
			function detectBuried(jobid)
			{
				producer.peek_buried(function(err, buriedID, payload)
				{
					worker.removeListener('job.buried', detectBuried);

					demand(err).not.exist();
					buriedID.must.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			}

			worker.on('job.buried', detectBuried);

			var job = { type: 'reverse', payload: 'bury'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('can call touch() on jobs in progress', function(done)
		{
			this.timeout(15000);

			var jobid, timeleft;

			function getInfo()
			{
				worker.client.stats_job(jobid, function(err, info)
				{
					demand(err).not.exist();
					timeleft = info['time-left'];
					timeleft.must.be.below(27); // 30 seconds minus the 2 second wait

					worker.client.touch(jobid, function(err)
					{
						demand(err).not.exist();

						worker.client.stats_job(jobid, function(err, info2)
						{
							// now test that the wait has been reset
							demand(err).not.exist();
							info2['time-left'].must.be.above(timeleft);
						});
					});
				});
			}

			function handled()
			{
				worker.removeListener('job.handled', handled);
				done();
			}

			function handleReserved(id)
			{
				jobid = id;
				worker.removeListener('job.reserved', handleReserved);
				worker.on('job.handled', handled);

				setTimeout(getInfo, 3000);
			}

			worker.on('job.reserved', handleReserved);
			worker.on('warning', console.log);

			var job = { type: 'longasync', payload: 'ignored' };
			producer.put(0, 0, 30, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

		it('releases jobs when the handler responds with "release"', function(done)
		{
			function detectReleased(jobid)
			{
				worker.stop();
				worker.removeListener('job.released', detectReleased);

				producer.peek_ready(function(err, releasedID, payload)
				{
					demand(err).not.exist();
					releasedID.must.equal(jobid);
					producer.destroy(releasedID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			}

			worker.on('job.released', detectReleased);

			var job = { type: 'reverse', payload: 'release' };
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
			});
		});

	});

	describe('log events', function()
	{
		it('have tests');
	});
});
