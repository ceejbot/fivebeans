/*global describe:true, it:true, before:true, after:true */

var
	should    = require('chai').should(),
	fivebeans = require('../index'),
	fs        = require('fs')
	;

var host = '127.0.0.1';
var port = 11300;
var tube = 'testtube';


function StringReverser()
{
	this.type = 'reverse';
}

StringReverser.prototype.work = function(payload, callback)
{
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
	{ type: 'reverse', payload: 'able was I ere I saw Elba' }
];

var testopts =
{
	id: 'testworker',
	host: host,
	port: port,
	ignoreDefault: true,
	handlers:
	{
		reverse: StringReverser
	}
};

describe('FiveBeansWorker', function()
{
	var producer, worker, testjobid;

	before(function()
	{
		producer = new fivebeans.client(host, port);
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

	describe('start()', function()
	{
		it('emits the started event on success', function(done)
		{
			var w = new fivebeans.worker(testopts);
			w.on('started', function()
			{
				done();
			}).on('error', function(err)
			{
				throw(err);
			});
			w.start();
		});

		it('emits the error event on failure', function(done)
		{
			var w = new fivebeans.worker({id: 'fail', port: 5000});
			w.on('error', function(err)
			{
				err.should.be.ok;
				err.errno.should.equal('ECONNREFUSED');
				done();
			});
			w.start();
		});
	});

	describe('watch', function()
	{

	});

	describe('log events', function()
	{

	});

	after(function()
	{

	});

});
