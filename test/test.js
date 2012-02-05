var should = require('chai').should();

var fivebeans = require('../fivebeans');

var host = '10.0.0.14';
var port = 11300;
var tube = 'testtube';

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
			producer.host.should.equal('10.0.0.14');
			producer.port.should.equal(11300);
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
	describe('job producer', function()
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
	describe('job consumer', function()
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
		it('#release releases a job', function(done)
		{
			consumer.release(testjobid, 1, 1, function(err)
			{
				should.not.exist(err);
				done();
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
		it('#bury buries a job', function(done)
		{
			// this takes a second because of the minumum delay enforced by release() above
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
		it('#destroy deletes a job', function(done)
		{
			consumer.reserve(function(err, jobid, payload)
			{
				consumer.destroy(jobid, function(err)
				{
					should.not.exist(err);
					done();
				});
			});
		});
		it('#reserve_with_timeout times out when no jobs are waiting', function(done)
		{
			consumer.reserve_with_timeout(0, function(err, jobid, payload)
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
