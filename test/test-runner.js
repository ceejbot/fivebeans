/*global describe:true, it:true, before:true, after:true */

var
	demand    = require('must'),
	fivebeans = require('../index'),
	fs        = require('fs'),
	util      = require('util')
	;

//-------------------------------------------------------------

describe('FiveBeansRunner', function()
{
	describe('constructor', function()
	{
		it('throws when not given an id', function()
		{
			function shouldThrow()
			{
				var r = new fivebeans.runner();
			}
			shouldThrow.must.throw(Error);
		});

		it('throws when not given a config path', function()
		{
			function shouldThrow()
			{
				var r = new fivebeans.runner('test');
			}
			shouldThrow.must.throw(Error);
		});

		it('throws if given a config path that does not exist', function()
		{
			function shouldThrow()
			{
				var r = new fivebeans.runner('test', '/not/a/real/path.yml');
			}
			shouldThrow.must.throw(Error);
		});

		it('creates a runner when given valid options', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');

			r.must.have.property('worker');
			r.id.must.equal('test');
			r.configpath.must.equal(__dirname + '/fixtures/runner.yml');
		});
	});

	describe('readConfiguration()', function()
	{
		it('throws when the config requires non-existing handlers', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/badconfig.yml');

			function shouldThrow()
			{
				var config = r.readConfiguration();
			}
			shouldThrow.must.throw(Error);
		});

		it('returns a config object for a good config', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');
			var config = r.readConfiguration();

			config.must.be.an.object();
			config.must.have.property('beanstalkd');
			config.beanstalkd.host.must.equal('localhost');
			config.watch.must.be.an.array();
			config.ignoreDefault.must.equal(true);
		});
	});

	describe('createWorker()', function()
	{
		var worker;

		it('returns a worker', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');
			worker = r.createWorker();

			worker.must.exist();
			worker.must.be.an.object();
			(worker instanceof fivebeans.worker).must.equal(true);
		});

		it('started the worker', function(done)
		{
			worker.stopped.must.equal(false);
			worker.client.must.exist();
			worker.on('stopped', done);
			worker.stop();
		})
	});

	describe('go()', function()
	{
		it('creates and starts a worker', function(done)
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');
			r.go();

			r.worker.must.exist();
			r.worker.client.must.exist();
			r.worker.on('stopped', done);
			r.worker.stop();
		});
	});

});
