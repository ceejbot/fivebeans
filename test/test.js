var should = require('chai').should();

var fivebeans = require('../fivebeans'),
	fs = require('fs')
	;

var host = '10.0.0.14';
var port = 11300;
var tube = 'testtube';

function readTestImage()
{
	return fs.readFileSync('./test/test.png');
}

describe('FiveBeansClient', function()
{
	var producer = null;
	var consumer = null;
	var testjobid = null;

	before(function()
	{
		producer = new fivebeans.client(host);
		consumer = new fivebeans.client(host, port);
	});

	describe('#FiveBeansClient()', function()
	{
		it('creates a client with the passed-in options', function()
		{
			producer.host.should.equal(host);
			producer.port.should.equal(port);
		});
	});
	describe('#connect()', function()
	{
		it('creates and saves a connection', function(done)
		{
			producer.connect(function(err)
			{
				should.not.exist(err);
				producer.stream.should.be.ok;
				done();
			});
		});
	});
	describe('job producer:', function()
	{
		it('#use connects to a specific tube', function(done)
		{
			producer.use(tube, function(err, response)
			{
				should.not.exist(err);
				response.should.equal(tube);
				done();
			});
		});
		it('#list_tube_used returns the tube used by a producer', function(done)
		{
			producer.list_tube_used(function(err, response)
			{
				should.not.exist(err);
				response.should.equal(tube);
				done();
			});
		});
		it('#put submits a job', function(done)
		{
			var data = { type: 'test', payload: 'the explosive energy of the warhead of a missile or of the bomb load  of an aircraft' };
			producer.put(0, 0, 60, JSON.stringify(data), function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.exist;
				done();
			});
		});
	});
	describe('job consumer:', function()
	{
		it('#watch watches a tube', function(done)
		{
			consumer.connect(function(err)
			{
				consumer.watch(tube, function(err, response)
				{
					should.not.exist(err);
					response.should.equal('2');
					done();
				});
			});
		});
		it('#ignore ignores a tube', function(done)
		{
			consumer.ignore('default', function(err, response)
			{
				should.not.exist(err);
				response.should.equal('1');
				done();
			});
		});
		it('#list_tubes_watched returns the tubes the consumer watches', function(done)
		{
			consumer.list_tubes_watched(function(err, response)
			{
				should.not.exist(err);
				response.length.should.equal(1);
				response.indexOf(tube).should.equal(0);
				done();
			});
		});
		it('#peek_ready peeks ahead at jobs', function(done)
		{
			this.timeout(4000);
			producer.peek_ready(function(err, jobid, payload)
			{
				should.not.exist(err);
				jobid.should.exist;
				testjobid = jobid;
				var parsed = JSON.parse(payload);
				parsed.should.have.property('type');
				parsed.type.should.equal('test');
				done();
			});
		});
		it('#stats_job returns job stats', function(done)
		{
			consumer.stats_job(testjobid, function(err, response)
			{
				response.should.be.a('object');
				response.should.have.property('id');
				response.id.should.equal(parseInt(testjobid));
				response.tube.should.equal(tube);
				done();
			});
		});
		it('#reserve returns a job', function(done)
		{
			consumer.reserve(function(err, jobid, payload)
			{
				should.not.exist(err);
				jobid.should.equal(testjobid);
				var parsed = JSON.parse(payload);
				parsed.should.have.property('type');
				parsed.type.should.equal('test');
				done();
			});
		});
		it('#touch informs the server the client is still working', function(done)
		{
			consumer.touch(testjobid, function(err)
			{
				should.not.exist(err);
				done();
			});
		});
		it('#release releases a job', function(done)
		{
			consumer.release(testjobid, 1, 1, function(err)
			{
				should.not.exist(err);
				done();
			});
		});

		it('jobs can contain binary data', function(done)
		{
			var payload = readTestImage();
			var ptr = 0;
			producer.put(0, 0, 60, payload, function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.exist;

				consumer.reserve(function(err, returnID, returnPayload)
				{
					should.not.exist(err);
					returnID.should.equal(jobid);

					// we should get back exactly the same bytes we put in
					returnPayload.length.should.equal(payload.length);
					while (ptr < returnPayload.length)
					{
						returnPayload[ptr].should.equal(payload[ptr]);
						ptr++;
					}
					consumer.destroy(returnID, function(err)
					{
						should.not.exist(err);
						done();
					});
				});
			});
		});

		it('jobs can contain utf8 data', function(done)
		{
			var payload = "Many people like crème brûlée.";
			var returnString;
			producer.put(0, 0, 60, payload, function(err, jobid)
			{
				should.not.exist(err);
				jobid.should.exist;

				consumer.reserve(function(err, returnID, returnPayload)
				{
					should.not.exist(err);
					returnID.should.equal(jobid);
					// we should get back exactly the same bytes we put in
					returnString = returnPayload.toString();
					returnString.should.equal(payload);
					consumer.destroy(returnID, function(err)
					{
						should.not.exist(err);
						done();
					});
				});
			});
		});

		it('#peek_delayed returns data for a delayed job', function(done)
		{
			producer.peek_delayed(function(err, jobid, payload)
			{
				should.not.exist(err);
				jobid.should.equal(testjobid);
				done();
			});
		});
		it('#bury buries a job (> 1sec expected)', function(done)
		{
			// this takes a second because of the minumum delay enforced by release() above
			this.timeout(3000);
			consumer.reserve(function(err, jobid, payload)
			{
				consumer.bury(jobid, fivebeans.LOWEST_PRIORITY, function(err)
				{
					should.not.exist(err);
					done();
				});
			});
		});
		it('#peek_buried returns data for a buried job', function(done)
		{
			producer.peek_buried(function(err, jobid, payload)
			{
				should.not.exist(err);
				jobid.should.equal(testjobid);
				done();
			});
		});
		it('#kick un-buries jobs in the producer\'s used queue', function(done)
		{
			producer.kick(10, function(err, count)
			{
				should.not.exist(err);
				count.should.equal('1');
				done();
			});
		});
		it('#pause_tube suspends new job reservations (> 1sec expected)', function(done)
		{
			consumer.pause_tube(tube, 3, function(err)
			{
				should.not.exist(err);
				consumer.reserve_with_timeout(1, function(err, jobid, payload)
				{
					err.should.equal('TIMED_OUT');
					done();
				});
			});
		});
		it('#destroy deletes a job (nearly 2 sec expected)', function(done)
		{
			// this takes a couple of seconds because of the minumum delay enforced by pause_tube() above
			this.timeout(5000);
			consumer.reserve(function(err, jobid, payload)
			{
				consumer.destroy(jobid, function(err)
				{
					should.not.exist(err);
					done();
				});
			});
		});
		it('#reserve_with_timeout times out when no jobs are waiting (> 1sec expected)', function(done)
		{
			this.timeout(3000);
			consumer.reserve_with_timeout(1, function(err, jobid, payload)
			{
				err.should.equal('TIMED_OUT');
				done();
			});
		});
	});

	describe('server statistics', function()
	{
		it('#stats returns a hash of server stats', function(done)
		{
			consumer.stats(function(err, response)
			{
				response.should.be.a('object');
				response.should.have.property('pid');
				response.should.have.property('version');
				done();
			});
		});
		it('#list_tubes returns a list of tubes', function(done)
		{
			consumer.list_tubes(function(err, response)
			{
				should.not.exist(err);
				response.length.should.be.above(0);
				response.indexOf(tube).should.be.above(-1);
				done();
			});
		});
		it('#stats_tube returns a hash of tube stats', function(done)
		{
			consumer.stats_tube(tube, function(err, response)
			{
				response.should.be.a('object');
				done();
			});
		});
		it('#stats_tube() returns not found for non-existent tubes', function(done)
		{
			consumer.stats_tube('i-dont-exist', function(err, response)
			{
				err.should.be.a('string');
				err.should.equal('NOT_FOUND');
				done();
			});
		});
	});

	// untested: consumer.touch(), consumer.pause_tube()
});
