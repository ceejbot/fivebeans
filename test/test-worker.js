/*global describe:true, it:true, before:true, after:true */

var
	should    = require('chai').should(),
	events    = require('events'),
	fivebeans = require('../index'),
	fs        = require('fs')
	;

//-------------------------------------------------------------
// some job handlers for testing

function StringReverser()
{
	this.type = 'reverse';
}

StringReverser.prototype.work = function(payload, callback)
{
	this.reverseString(payload);
	callback('success');
};

StringReverser.prototype.reverseString = function(input)
{
	var letters = input.split('');
	letters.reverse();
	return letters.join('');
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
		reverse: new StringReverser(),
	}
};

//-------------------------------------------------------------

describe('FiveBeansWorker', function()
{
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
			this.timeout(5000);
			w.on('stopped', function()
			{
				w.stopped.should.equal(true);
				done();
			});

			w.stop();
		});

	});

	describe('watch', function()
	{
		it('watches tubes on start', function(done)
		{
			worker = new fivebeans.worker(testopts);
			worker.on('started', function()
			{
				// check to see if it's watching testtube
				done();
			});

			worker.start([tube]);
		});
	});

	describe('log events', function()
	{

	});

	after(function()
	{

	});

});
