/*global describe:true, it:true, before:true, after:true */

var
	demand    = require('must'),
	fivebeans = require('../index'),
	fs        = require('fs'),
	semver    = require('semver')
	;

var host = '127.0.0.1';
var port = 11300;
var tube = 'testtube';

function readTestImage()
{
	return fs.readFileSync('./test/test.png');
}

describe('FiveBeansClient', function()
{
	var producer, consumer, testjobid;
	var version;

	before(function()
	{
		producer = new fivebeans.client(host);
		consumer = new fivebeans.client(host, port);
	});

	describe('#FiveBeansClient()', function()
	{
		it('creates a client with the passed-in options', function()
		{
			producer.host.must.equal(host);
			producer.port.must.equal(port);
		});
	});

	describe('#connect()', function()
	{
		it('creates and saves a connection', function(done)
		{
			producer.on('connect', function()
			{
				producer.stream.must.exist();
				done();

			}).on('error', function(err)
			{
				throw(err);
			});
			producer.connect();
		});
	});

	describe('job producer:', function()
	{
		it('#use() connects to a specific tube', function(done)
		{
			producer.use(tube, function(err, response)
			{
				demand(err).not.exist();
				response.must.equal(tube);
				done();
			});
		});

		it('#list_tube_used() returns the tube used by a producer', function(done)
		{
			producer.list_tube_used(function(err, response)
			{
				demand(err).not.exist();
				response.must.equal(tube);
				done();
			});
		});

		it('#put() submits a job', function(done)
		{
			var data = { type: 'test', payload: 'the explosive energy of the warhead of a missile or of the bomb load  of an aircraft' };
			producer.put(0, 0, 60, JSON.stringify(data), function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();
				done();
			});
		});

		after(function(done)
		{
			producer.stats(function(err, response)
			{
				if (response.version)
					version = response.version + '.0';
				done();
			});

		});
	});

	describe('job consumer:', function()
	{
		it('#watch() watches a tube', function(done)
		{
			consumer.on('connect', function()
			{
				consumer.watch(tube, function(err, response)
				{
					demand(err).not.exist();
					response.must.equal('2');
					done();
				});
			}).on('error', function(err)
			{
				throw(err);
			});
			consumer.connect();
		});

		it('#ignore() ignores a tube', function(done)
		{
			consumer.ignore('default', function(err, response)
			{
				demand(err).not.exist();
				response.must.equal('1');
				done();
			});
		});

		it('#list_tubes_watched() returns the tubes the consumer watches', function(done)
		{
			consumer.list_tubes_watched(function(err, response)
			{
				demand(err).not.exist();
				response.length.must.equal(1);
				response.indexOf(tube).must.equal(0);
				done();
			});
		});

		it('#peek_ready() peeks ahead at jobs', function(done)
		{
			this.timeout(4000);
			producer.peek_ready(function(err, jobid, payload)
			{
				demand(err).not.exist();
				jobid.must.exist();
				testjobid = jobid;
				var parsed = JSON.parse(payload);
				parsed.must.have.property('type');
				parsed.type.must.equal('test');
				done();
			});
		});

		it('#stats_job() returns job stats', function(done)
		{
			consumer.stats_job(testjobid, function(err, response)
			{
				response.must.be.an.object();
				response.must.have.property('id');
				response.id.must.equal(parseInt(testjobid, 10));
				response.tube.must.equal(tube);
				done();
			});
		});

		it('consumer can run stats_job() while a job is reserved', function(done)
		{
			consumer.reserve(function(err, jobid, payload)
			{
				demand(err).not.exist();
				consumer.stats_job(jobid, function(err, res)
				{
					demand(err).not.exist();
					res.must.be.an.object();
					res.must.have.property('id');
					res.id.must.equal(parseInt(jobid, 10));
					res.state.must.equal('reserved');
					consumer.release(jobid, 1, 1, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			});
		});

		it('#reserve() returns a job', function(done)
		{
			consumer.reserve(function(err, jobid, payload)
			{
				demand(err).not.exist();
				jobid.must.equal(testjobid);
				var parsed = JSON.parse(payload);
				parsed.must.have.property('type');
				parsed.type.must.equal('test');
				done();
			});
		});

		it('#touch() informs the server the client is still working', function(done)
		{
			consumer.touch(testjobid, function(err)
			{
				demand(err).not.exist();
				done();
			});
		});

		it('#release() releases a job', function(done)
		{
			consumer.release(testjobid, 1, 1, function(err)
			{
				demand(err).not.exist();
				done();
			});
		});

		it('jobs can contain binary data', function(done)
		{
			var payload = readTestImage();
			var ptr = 0;

			producer.put(0, 0, 60, payload, function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();

				consumer.reserve(function(err, returnID, returnPayload)
				{
					demand(err).not.exist();
					returnID.must.equal(jobid);

					// we should get back exactly the same bytes we put in
					returnPayload.length.must.equal(payload.length);
					while (ptr < returnPayload.length)
					{
						returnPayload[ptr].must.equal(payload[ptr]);
						ptr++;
					}
					consumer.destroy(returnID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			});
		});

		it('jobs can contain utf8 data', function(done)
		{
			var payload = 'Many people like crème brûlée.';
			var returnString;
			producer.put(0, 0, 60, payload, function(err, jobid)
			{
				demand(err).not.exist();
				jobid.must.exist();

				consumer.reserve(function(err, returnID, returnPayload)
				{
					demand(err).not.exist();
					returnID.must.equal(jobid);
					// we should get back exactly the same bytes we put in
					returnString = returnPayload.toString();
					returnString.must.equal(payload);
					consumer.destroy(returnID, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			});
		});

		it('#peek_delayed() returns data for a delayed job', function(done)
		{
			producer.peek_delayed(function(err, jobid, payload)
			{
				demand(err).not.exist();
				jobid.must.equal(testjobid);
				done();
			});
		});

		it('#bury() buries a job (> 1sec expected)', function(done)
		{
			// this takes a second because of the minumum delay enforced by release() above
			this.timeout(3000);
			consumer.reserve(function(err, jobid, payload)
			{
				consumer.bury(jobid, fivebeans.LOWEST_PRIORITY, function(err)
				{
					demand(err).not.exist();
					done();
				});
			});
		});

		it('#peek_buried() returns data for a buried job', function(done)
		{
			producer.peek_buried(function(err, jobid, payload)
			{
				demand(err).not.exist();
				jobid.must.equal(testjobid);
				done();
			});
		});

		it('#kick() un-buries jobs in the producer\'s used queue', function(done)
		{
			producer.kick(10, function(err, count)
			{
				demand(err).not.exist();
				count.must.equal('1');
				done();
			});
		});

		it('#kick_job() kicks a specific job id', function(done)
		{
			// Skip the test if the version of beanstalkd doesn't have this command.
			// Beanstalkd does not have semver-compliant version numbers, however.
			if (version.match(/\d+\.\d+\.\d+\.\d+/))
			{
				version = version.replace(/\.\d+$/, '');
			}
			if (!semver.satisfies(version, '>= 1.8.0'))
				return done();

			consumer.reserve(function(err, jobid, payload)
			{
				consumer.bury(testjobid, fivebeans.LOWEST_PRIORITY, function(err)
				{
					demand(err).not.exist();

					producer.kick_job(testjobid, function(err)
					{
						demand(err).not.exist();
						done();
					});
				});
			});
		});

		it('#pause_tube() suspends new job reservations (> 1sec expected)', function(done)
		{
			consumer.pause_tube(tube, 3, function(err)
			{
				demand(err).not.exist();
				consumer.reserve_with_timeout(1, function(err, jobid, payload)
				{
					err.must.equal('TIMED_OUT');
					done();
				});
			});
		});

		it('#destroy() deletes a job (nearly 2 sec expected)', function(done)
		{
			// this takes a couple of seconds because of the minumum delay enforced by pause_tube() above
			this.timeout(5000);
			consumer.reserve(function(err, jobid, payload)
			{
				consumer.destroy(jobid, function(err)
				{
					demand(err).not.exist();
					done();
				});
			});
		});

		it('#reserve_with_timeout() times out when no jobs are waiting (> 1sec expected)', function(done)
		{
			this.timeout(3000);
			consumer.reserve_with_timeout(1, function(err, jobid, payload)
			{
				err.must.equal('TIMED_OUT');
				done();
			});
		});
	});

	describe('server statistics', function()
	{
		it('#stats() returns a hash of server stats', function(done)
		{
			consumer.stats(function(err, response)
			{
				response.must.be.an.object();
				response.must.have.property('pid');
				response.must.have.property('version');
				done();
			});
		});

		it('#list_tubes() returns a list of tubes', function(done)
		{
			consumer.list_tubes(function(err, response)
			{
				demand(err).not.exist();
				response.length.must.be.above(0);
				response.indexOf(tube).must.be.above(-1);
				done();
			});
		});

		it('#stats_tube() returns a hash of tube stats', function(done)
		{
			consumer.stats_tube(tube, function(err, response)
			{
				response.must.be.an.object();
				done();
			});
		});

		it('#stats_tube() returns not found for non-existent tubes', function(done)
		{
			consumer.stats_tube('i-dont-exist', function(err, response)
			{
				err.must.be.a.string();
				err.must.equal('NOT_FOUND');
				done();
			});
		});
	});
	
	describe('concurrent commands', function()
	{
		it('can be handled', function(done)
		{
			var concurrency = 10;
			var replied = 0;
			var handleResponse = function(err, response)
			{
				if (++replied >= concurrency) {
					done();
				}
			};
			for (var i = 0; i < 10; ++i) {
				consumer.stats_tube(tube, handleResponse);
			}
		});
	});

});
