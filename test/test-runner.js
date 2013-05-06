/*global describe:true, it:true, before:true, after:true */

var
	should    = require('chai').should(),
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
			shouldThrow.should.throw(Error);
		});

		it('throws when not given a config path', function()
		{
			function shouldThrow()
			{
				var r = new fivebeans.runner('test');
			}
			shouldThrow.should.throw(Error);
		});

		it('throws if given a config path that does not exist', function()
		{
			function shouldThrow()
			{
				var r = new fivebeans.runner('test', '/not/a/real/path.yml');
			}
			shouldThrow.should.throw(Error);
		});

		it('creates a runner when given valid options', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');

			r.should.have.property.worker;
			r.id.should.equal('test');
			r.configpath.should.equal(__dirname + '/fixtures/runner.yml');
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
			shouldThrow.should.throw(Error);
		});

		it('returns a config object for a good config', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');
			var config = r.readConfiguration();

			config.should.be.an('object');
			config.should.have.property('beanstalkd');
			config.beanstalkd.host.should.equal('localhost');
			config.watch.should.be.an('array');
			config.ignoreDefault.should.equal(true);
		});
	});

	describe('createWorker()', function()
	{
		var worker;

		it('returns a worker', function()
		{
			var r = new fivebeans.runner('test', 'test/fixtures/runner.yml');
			worker = r.createWorker();

			worker.should.be.ok;
			worker.should.be.an('object');
			(worker instanceof fivebeans.worker).should.equal(true);
		});

		it('started the worker', function(done)
		{
			worker.stopped.should.equal(false);
			worker.client.should.be.ok;
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

			r.worker.should.be.ok;
			r.worker.client.should.be.ok;
			r.worker.on('stopped', done);
			r.worker.stop();
		});
	});

});
