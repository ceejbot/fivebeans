/*global describe:true, it:true, before:true, after:true */

var
	should    = require('chai').should(),
	events    = require('events'),
	fivebeans = require('../index'),
	fs        = require('fs'),
	util      = require('util')
	;

//-------------------------------------------------------------
// some job handlers for testing

function TestHandler()
{
	events.EventEmitter.call(this);
	this.type = 'reverse';
}
util.inherits(TestHandler, events.EventEmitter);

TestHandler.prototype.work = function(payload, callback)
{
	this.emit('result', this.reverseWords(payload));
	callback(payload, 20);
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
	}
};

//-------------------------------------------------------------

describe('FiveBeansWorker', function()
{
	this.timeout(5000);
	var producer, worker, testjobid;

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

			w.id.should.equal(opts.id);
			w.host.should.equal(opts.host);
			w.port.should.equal(opts.port);
		});

		it('inherits from EventEmitter', function()
		{
			var w = new fivebeans.worker({ id: 'testworker' });
			w.should.have.property('on');
			w.on.should.be.a('function');
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
				err.should.be.ok;
				err.errno.should.equal('ECONNREFUSED');
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
				w.stopped.should.equal(true);
				done();
			});

			w.stop();
		});

	});

	describe('job processing', function()
	{
		it('watches tubes on start', function(done)
		{
			worker = new fivebeans.worker(testopts);
			// worker.on('info', function(obj) { console.log(obj); })
			// worker.on('warning', function(obj) { console.error(util.inspect(obj)); })

			function handleStart()
			{
				worker.client.list_tubes_watched(function(err, response)
				{
					should.not.exist(err);
					response.should.be.an('array');
					response.length.should.equal(1);
					response.indexOf(tube).should.equal(0);

					worker.removeListener('started', handleStart);

					done();
				});
			}

			worker.on('started', handleStart);
			worker.start([tube]);
		});

		it('deletes jobs with bad formats', function(done)
		{
			var job = { format: 'bad'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;

				function detectReady()
				{
					producer.peek_ready(function(err, jobid, payload)
					{
						err.should.be.ok;
						err.should.equal('NOT_FOUND');
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

					should.not.exist(err);
					buriedID.should.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						should.not.exist(err);
						done();
					});
				});
			}

			worker.on('job.buried', handleBuried);

			producer.put(0, 0, 60, '{ I am invalid JSON', function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;
			});
		});

		it('buries jobs for which it has no handler', function(done)
		{
			function handleBuried(jobid)
			{
				producer.peek_buried(function(err, buriedID, payload)
				{
					worker.removeListener('job.buried', handleBuried);

					should.not.exist(err);
					buriedID.should.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						should.not.exist(err);
						done();
					});
				});
			}

			worker.on('job.buried', handleBuried);
			var job = { type: 'unknown', payload: 'extremely important!'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;
			});
		});

		it('passes good jobs to handlers', function(done)
		{
			var handler = testopts.handlers.reverse;

			function verifyResult(item)
			{
				item.should.be.ok;
				item.should.equal('success');
				handler.removeListener('result', verifyResult);
				done();
			}

			handler.on('result', verifyResult);
			var job = { type: 'reverse', payload: 'success'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;
			});
		});

		it('releases jobs when the handler responds with "release"', function(done)
		{
			function restarted()
			{
				worker.removeListener('started', restarted);
				done();
			}

			function detectReleased(jobid)
			{
				worker.stop();
				worker.removeListener('job.released', detectReleased);

				producer.peek_delayed(function(err, releasedID, payload)
				{
					should.not.exist(err);
					releasedID.should.equal(jobid);
					producer.destroy(releasedID, function(err)
					{
						should.not.exist(err);
						worker.on('started', restarted);
						worker.start([tube]);
					});
				});
			}

			worker.on('job.released', detectReleased);

			var job = { type: 'reverse', payload: 'release'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;
				worker.stop();
			});
		});

		it('buries jobs when the handler responds with "bury"', function(done)
		{
			function detectBuried(jobid)
			{
				producer.peek_buried(function(err, buriedID, payload)
				{
					worker.removeListener('job.buried', detectBuried);

					should.not.exist(err);
					buriedID.should.equal(jobid);
					producer.destroy(buriedID, function(err)
					{
						should.not.exist(err);
						done();
					});
				});
			}

			worker.on('job.buried', detectBuried);

			var job = { type: 'reverse', payload: 'bury'};
			producer.put(0, 0, 60, JSON.stringify(job), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.be.ok;
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
				should.not.exist(err);
				jobid.should.be.ok;
			});
		});

	});

	describe('log events', function()
	{

	});

	after(function(done)
	{
		worker.stop();
		done();
	});

});
